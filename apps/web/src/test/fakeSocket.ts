import type { ServerToClientEvents, SocketAck } from '@arbiter/shared';
import type { ArbiterSocket } from '@/lib/socket';

type Listener = (...args: unknown[]) => void;

export interface EmittedEvent {
  event: string;
  /** Arguments without the trailing ack callback. */
  args: unknown[];
}

export interface FakeSocket {
  /** Install with setSocketForTesting(fake.socket) from '@/lib/socket'. */
  socket: ArbiterSocket;
  /** Everything the client emitted (subscribe/unsubscribe calls), in order. */
  emitted: EmittedEvent[];
  /** Deliver a server event to the client's listeners. */
  serverEmit<E extends keyof ServerToClientEvents>(
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void;
  /** Simulate a dropped connection followed by a reconnect (fires disconnect, then connect). */
  reconnect(): void;
  disconnect(): void;
  connect(): void;
  /** Ack returned to client emits (default {ok:true}). */
  setAck(ack: SocketAck): void;
}

/**
 * In-memory stand-in for the Socket.IO client, for component tests:
 *
 *   const fake = createFakeSocket();
 *   setSocketForTesting(fake.socket);
 *   render(<LandingPage />, { wrapper });
 *   act(() => fake.serverEmit('feed:judged', event));
 *   expect(fake.emitted).toContainEqual({ event: 'feed:subscribe', args: [] });
 */
export function createFakeSocket({ connected = true } = {}): FakeSocket {
  const listeners = new Map<string, Set<Listener>>();
  const emitted: EmittedEvent[] = [];
  let ack: SocketAck = { ok: true };
  const state = { connected, active: connected };

  const fire = (event: string, ...args: unknown[]) => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
  };

  const socket = {
    id: 'fake-socket',
    get connected() {
      return state.connected;
    },
    get active() {
      return state.active;
    },
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
      return socket;
    },
    off(event: string, listener?: Listener) {
      if (listener) listeners.get(event)?.delete(listener);
      else listeners.delete(event);
      return socket;
    },
    emit(event: string, ...args: unknown[]) {
      const last = args.at(-1);
      const callback = typeof last === 'function' ? (last as (a: SocketAck) => void) : undefined;
      emitted.push({ event, args: callback ? args.slice(0, -1) : args });
      callback?.(ack);
      return socket;
    },
    connect() {
      if (!state.connected) {
        state.connected = true;
        state.active = true;
        fire('connect');
      }
      return socket;
    },
    disconnect() {
      if (state.connected) {
        state.connected = false;
        state.active = false;
        fire('disconnect', 'io client disconnect');
      }
      return socket;
    },
  };

  return {
    socket: socket as unknown as ArbiterSocket,
    emitted,
    serverEmit(event, payload) {
      fire(event, payload);
    },
    reconnect() {
      socket.disconnect();
      socket.connect();
    },
    disconnect() {
      socket.disconnect();
    },
    connect() {
      socket.connect();
    },
    setAck(next) {
      ack = next;
    },
  };
}
