import {
  SOCKET_AUTH_ERROR,
  ServerEventSchemas,
  type ClientToServerEvents,
  type ContestRoomPayload,
  type ServerToClientEvents,
  type SocketAck,
  type SubmissionRoomPayload,
} from '@arbiter/shared';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth, type AuthState } from '@/stores/auth';

/**
 * Socket.IO client (spec section 11). One shared connection, created on first use. It carries
 * the current access token in the handshake (`auth: { token }`; guests connect without one),
 * reconnects when the signed-in identity changes, and on connect_error "UNAUTHORIZED"
 * refreshes the token and reconnects. Events are hints: REST (TanStack Query) stays the
 * source of truth, so pages should refetch after reconnects (useRoom's `invalidate`).
 */
export type ArbiterSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ServerEvent = keyof ServerToClientEvents;

let socket: ArbiterSocket | null = null;
let disposeSocket: (() => void) | null = null;
/** True between creating the socket and its first connect() (the boot refresh may be pending). */
let connectPending = false;
const statusListeners = new Set<() => void>();

function notifyStatus(): void {
  for (const listener of statusListeners) listener();
}

function identityOf(state: Pick<AuthState, 'user'>): string {
  return state.user ? `${state.user.id}:${state.user.role}` : 'guest';
}

function createSocket(): ArbiterSocket {
  const client: ArbiterSocket = io({
    path: '/socket.io',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // Evaluated on every (re)connection attempt, so reconnects always use the newest token.
    auth: (cb) => {
      const token = useAuth.getState().accessToken;
      cb(token ? { token } : {});
    },
  });

  let authFailures = 0;
  const onConnect = () => {
    authFailures = 0;
  };
  const onConnectError = (error: Error) => {
    if (error.message !== SOCKET_AUTH_ERROR) return; // transport errors: socket.io retries itself
    if (authFailures >= 2) return; // give up until the token changes
    authFailures += 1;
    void useAuth
      .getState()
      .refresh()
      .finally(() => {
        // Renewed: reconnect with the new token. Rejected: the store is now a guest.
        if (!client.connected) client.connect();
      });
  };
  // The server closes a socket when its access token expires (or for flooding); socket.io does
  // not reconnect after a server-initiated disconnect. The auth callback supplies the newest
  // token, and a stale one lands in onConnectError (refresh, then reconnect).
  const onDisconnect = (reason: string) => {
    if (reason === 'io server disconnect') client.connect();
  };
  client.on('connect', onConnect);
  client.on('connect_error', onConnectError);
  client.on('disconnect', onDisconnect);

  const unsubscribeAuth = useAuth.subscribe((state, previous) => {
    if (state.accessToken === previous.accessToken) return;
    authFailures = 0;
    if (connectPending) return; // the first connect() below will use the new token
    if (identityOf(state) !== identityOf(previous)) {
      // A different user (login, logout, role change): new handshake, new user room.
      client.disconnect();
      client.connect();
    } else if (!client.connected && !client.active) {
      client.connect(); // we had given up after auth failures; try again with the new token
    }
  });

  // Connect once the boot refresh has settled, so the first handshake carries the token.
  connectPending = true;
  void useAuth
    .getState()
    .ready()
    .then(() => {
      connectPending = false;
      if (socket === client && !client.connected) client.connect();
      notifyStatus();
    });

  const relay = () => notifyStatus();
  client.on('connect', relay);
  client.on('disconnect', relay);
  client.on('connect_error', relay);

  disposeSocket = () => {
    unsubscribeAuth();
    client.off('connect', onConnect);
    client.off('connect_error', onConnectError);
    client.off('disconnect', onDisconnect);
    client.off('connect', relay);
    client.off('disconnect', relay);
    client.off('connect_error', relay);
    client.disconnect();
  };
  return client;
}

/** The shared socket (created and connected on first call). */
export function getSocket(): ArbiterSocket {
  if (!socket) socket = createSocket();
  return socket;
}

/**
 * Tests: install a fake socket (see src/test/fakeSocket.ts) or pass null to drop the current
 * one. The test setup calls setSocketForTesting(null) after every test.
 */
export function setSocketForTesting(fake: ArbiterSocket | null): void {
  disposeSocket?.();
  disposeSocket = null;
  connectPending = false;
  socket = fake;
  notifyStatus();
}

// ---------------------------------------------------------------------------------------------
// Server events
// ---------------------------------------------------------------------------------------------

type ServerEventPayload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

export interface UseSocketEventOptions {
  /** false = don't listen (default true). */
  enabled?: boolean;
}

/**
 * Calls `handler` for every `event` from the server. Payloads are validated with the shared zod
 * schema (invalid ones are dropped). The latest handler is always used; no memoisation needed.
 *
 *   useSocketEvent('submission:test', (e) => { if (e.id === id) addChip(e); });
 */
export function useSocketEvent<E extends ServerEvent>(
  event: E,
  handler: (payload: ServerEventPayload<E>) => void,
  options: UseSocketEventOptions = {},
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const client = getSocket();
    const schema = ServerEventSchemas[event];
    const listener = (payload: unknown) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        if (import.meta.env.DEV)
          console.warn(`[socket] dropped invalid ${event}`, parsed.error.issues);
        return;
      }
      handlerRef.current(parsed.data as ServerEventPayload<E>);
    };
    const on = client.on.bind(client) as (name: string, fn: (payload: unknown) => void) => void;
    const off = client.off.bind(client) as (name: string, fn: (payload: unknown) => void) => void;
    on(event, listener);
    return () => off(event, listener);
  }, [event, enabled]);
}

// ---------------------------------------------------------------------------------------------
// Rooms (R6)
// ---------------------------------------------------------------------------------------------

export interface RoomPayloads {
  'submission:subscribe': SubmissionRoomPayload;
  'contest:subscribe': ContestRoomPayload;
  /** The feed room takes no payload: pass {} to join, null to stay out. */
  'feed:subscribe': Record<string, never>;
}
export type RoomEvent = keyof RoomPayloads;
export type RoomUnsubscribeEvent =
  'submission:unsubscribe' | 'contest:unsubscribe' | 'feed:unsubscribe';

const UNSUBSCRIBE_EVENT: Record<RoomEvent, RoomUnsubscribeEvent> = {
  'submission:subscribe': 'submission:unsubscribe',
  'contest:subscribe': 'contest:unsubscribe',
  'feed:subscribe': 'feed:unsubscribe',
};

function emitRoomEvent(
  client: ArbiterSocket,
  event: RoomEvent | RoomUnsubscribeEvent,
  payload: unknown,
  ack: (ack: SocketAck) => void = () => {},
): void {
  const emit = client.emit.bind(client) as (name: string, ...args: unknown[]) => void;
  if (event === 'feed:subscribe' || event === 'feed:unsubscribe') emit(event, ack);
  else emit(event, payload, ack);
}

export interface UseRoomOptions {
  /** Event sent on unmount. Defaults to the matching ':unsubscribe' event; false = none. */
  unsubscribeEvent?: RoomUnsubscribeEvent | false;
  /**
   * TanStack Query keys invalidated after every successful (re)subscribe: after the first join
   * (closes the gap between the initial fetch and joining the room) and after each reconnect
   * (events missed while offline).
   */
  invalidate?: readonly QueryKey[];
  /** Called with every subscribe ack, e.g. to show FORBIDDEN or NOT_FOUND. */
  onAck?: (ack: SocketAck) => void;
}

/**
 * Joins a socket room for the lifetime of the component (R6): emits `subscribeEvent` on mount
 * and on every `connect` (including reconnects after a token refresh), emits the unsubscribe
 * event on unmount or payload change, and invalidates `invalidate` keys after each join.
 * Pass `payload = null` to stay out of the room (e.g. while the id is unknown).
 *
 *   useRoom('contest:subscribe', { slug }, { invalidate: [qk.contests.scoreboard(slug)] });
 *   useRoom('submission:subscribe', id ? { id } : null, { invalidate: [qk.submissions.detail(id)] });
 *   useRoom('feed:subscribe', {});
 */
export function useRoom<E extends RoomEvent>(
  subscribeEvent: E,
  payload: RoomPayloads[E] | null,
  options: UseRoomOptions = {},
): void {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  // Stable dependency for object payloads written inline ({ id }).
  const payloadKey = payload === null ? null : JSON.stringify(payload);

  useEffect(() => {
    if (payloadKey === null) return;
    const client = getSocket();
    const data: unknown = JSON.parse(payloadKey);
    let mounted = true;

    const join = () => {
      emitRoomEvent(client, subscribeEvent, data, (ack) => {
        if (!mounted) return;
        optionsRef.current.onAck?.(ack);
        if (!ack.ok) return;
        for (const queryKey of optionsRef.current.invalidate ?? []) {
          void queryClient.invalidateQueries({ queryKey });
        }
      });
    };

    client.on('connect', join);
    if (client.connected) join();

    return () => {
      mounted = false;
      client.off('connect', join);
      const unsubscribe = optionsRef.current.unsubscribeEvent ?? UNSUBSCRIBE_EVENT[subscribeEvent];
      if (unsubscribe && client.connected) emitRoomEvent(client, unsubscribe, data);
    };
  }, [subscribeEvent, payloadKey, queryClient]);
}

// ---------------------------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------------------------

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

function statusSnapshot(): SocketStatus {
  if (!socket) return 'disconnected';
  if (socket.connected) return 'connected';
  return connectPending || socket.active ? 'connecting' : 'disconnected';
}

function subscribeStatus(onChange: () => void): () => void {
  const client = getSocket();
  statusListeners.add(onChange);
  // Also listen on the socket directly so fake sockets in tests drive the status too.
  client.on('connect', onChange);
  client.on('disconnect', onChange);
  return () => {
    statusListeners.delete(onChange);
    client.off('connect', onChange);
    client.off('disconnect', onChange);
  };
}

/** 'connected' | 'connecting' | 'disconnected' for "live" indicators (creates the socket). */
export function useSocketStatus(): SocketStatus {
  return useSyncExternalStore(subscribeStatus, statusSnapshot, () => 'disconnected');
}
