import type { Server as HttpServer } from 'node:http';
import {
  ContestRoomPayload,
  SOCKET_AUTH_ERROR,
  SubmissionRoomPayload,
  type AckCallback,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env';
import { prisma as defaultPrisma } from '../db/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import { createRedisConnection } from '../lib/redis';
import type { AuthUser } from '../middleware/auth';
import { isInvalidTextError } from '../middleware/error';
import { rooms } from './rooms';

export interface SocketData {
  /** Set from the handshake token (auth: { token }); undefined for guests. */
  user?: AuthUser;
  /** Access-token expiry (epoch ms) of an authenticated socket; undefined for guests. */
  expiresAt?: number;
  /** contest slug -> contest id for the contest rooms this socket joined. */
  contests: Map<string, string>;
}

export type ArbiterIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type ArbiterSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface RealtimeServer {
  io: ArbiterIoServer;
  /** Disconnects every socket, closes the HTTP server (Socket.IO does this) and the Redis clients. */
  close(): Promise<void>;
}

const MAX_TIMER_MS = 2 ** 31 - 1;

const noopAck: AckCallback = () => {};

/**
 * Per-socket token bucket: every room event may hit Postgres, so one connection must not bypass
 * the HTTP rate limit. A client uses a few events on connect or reconnect; a flood is answered
 * with RATE_LIMITED, and a socket that keeps flooding is disconnected.
 */
const EVENT_BUCKET_CAPACITY = 20;
const EVENT_REFILL_PER_SEC = 10;
const MAX_REJECTED_EVENTS = 25;

function limitEvents(socket: ArbiterSocket): void {
  let tokens = EVENT_BUCKET_CAPACITY;
  let refilledAt = Date.now();
  let rejected = 0;
  socket.use((packet, next) => {
    const now = Date.now();
    tokens = Math.min(
      EVENT_BUCKET_CAPACITY,
      tokens + ((now - refilledAt) / 1000) * EVENT_REFILL_PER_SEC,
    );
    refilledAt = now;
    if (tokens >= 1) {
      tokens -= 1;
      next();
      return;
    }
    // Drop the packet (no handler, no database lookup); answer an ack so the client does not hang.
    splitArgs(packet.slice(1)).ack({ ok: false, error: 'RATE_LIMITED' });
    rejected += 1;
    if (rejected >= MAX_REJECTED_EVENTS) socket.disconnect(true);
  });
}

/** Handlers take (payload?, ack?) defensively: the ack is always the last function argument. */
function splitArgs(args: unknown[]): { payload: unknown; ack: AckCallback } {
  const last = args.at(-1);
  const ack = typeof last === 'function' ? (last as AckCallback) : noopAck;
  const payload = typeof args[0] === 'function' ? undefined : args[0];
  return { payload, ack };
}

/** The admin privilege is re-read from the database: the handshake claim may be stale (demotion). */
async function isCurrentAdmin(prisma: PrismaClient, user: AuthUser | undefined): Promise<boolean> {
  if (user?.role !== 'ADMIN') return false;
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  return current?.role === 'ADMIN';
}

function registerRoomHandlers(socket: ArbiterSocket, prisma: PrismaClient): void {
  const fail = (ack: AckCallback, where: string, error: unknown) => {
    // Text the database cannot take (a NUL or a lone surrogate) that slipped past zod: a client
    // error, as in HTTP.
    if (isInvalidTextError(error)) {
      logger.debug({ event: where, socketId: socket.id }, 'socket payload had invalid text');
      ack({ ok: false, error: 'VALIDATION_ERROR' });
      return;
    }
    logger.error({ err: error, event: where, socketId: socket.id }, 'socket handler failed');
    ack({ ok: false, error: 'INTERNAL' });
  };

  socket.on('submission:subscribe', async (...args: unknown[]) => {
    const { payload, ack } = splitArgs(args);
    const parsed = SubmissionRoomPayload.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: 'VALIDATION_ERROR' });
    const user = socket.data.user;
    if (!user) return ack({ ok: false, error: 'UNAUTHORIZED' });
    try {
      const submission = await prisma.submission.findUnique({
        where: { id: parsed.data.id },
        select: { userId: true },
      });
      if (!submission) return ack({ ok: false, error: 'NOT_FOUND' });
      if (submission.userId !== user.id && !(await isCurrentAdmin(prisma, user))) {
        return ack({ ok: false, error: 'FORBIDDEN' });
      }
      await socket.join(rooms.submission(parsed.data.id));
      ack({ ok: true });
    } catch (error) {
      fail(ack, 'submission:subscribe', error);
    }
  });

  socket.on('submission:unsubscribe', async (...args: unknown[]) => {
    const { payload, ack } = splitArgs(args);
    const parsed = SubmissionRoomPayload.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: 'VALIDATION_ERROR' });
    await socket.leave(rooms.submission(parsed.data.id));
    ack({ ok: true });
  });

  socket.on('contest:subscribe', async (...args: unknown[]) => {
    const { payload, ack } = splitArgs(args);
    const parsed = ContestRoomPayload.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: 'VALIDATION_ERROR' });
    try {
      const contest = await prisma.contest.findUnique({
        where: { slug: parsed.data.slug },
        select: { id: true, isPublished: true },
      });
      if (!contest || (!contest.isPublished && !(await isCurrentAdmin(prisma, socket.data.user)))) {
        return ack({ ok: false, error: 'NOT_FOUND' });
      }
      socket.data.contests.set(parsed.data.slug, contest.id);
      await socket.join(rooms.contest(contest.id));
      ack({ ok: true });
    } catch (error) {
      fail(ack, 'contest:subscribe', error);
    }
  });

  socket.on('contest:unsubscribe', async (...args: unknown[]) => {
    const { payload, ack } = splitArgs(args);
    const parsed = ContestRoomPayload.safeParse(payload);
    if (!parsed.success) return ack({ ok: false, error: 'VALIDATION_ERROR' });
    const contestId = socket.data.contests.get(parsed.data.slug);
    if (contestId) {
      socket.data.contests.delete(parsed.data.slug);
      await socket.leave(rooms.contest(contestId));
    }
    ack({ ok: true });
  });

  socket.on('feed:subscribe', async (...args: unknown[]) => {
    const { ack } = splitArgs(args);
    await socket.join(rooms.feed);
    ack({ ok: true });
  });

  socket.on('feed:unsubscribe', async (...args: unknown[]) => {
    const { ack } = splitArgs(args);
    await socket.leave(rooms.feed);
    ack({ ok: true });
  });
}

/**
 * Socket.IO server on `httpServer` (path /socket.io) with the Redis adapter keyed by
 * SOCKET_IO_KEY (R6), handshake JWT auth (auth: { token }, optional for guests; an invalid
 * token fails the handshake with connect_error "UNAUTHORIZED") and the room handlers of spec
 * section 11. Authenticated sockets join user:<id> automatically.
 */
export function initRealtime(
  httpServer: HttpServer,
  deps: { prisma?: PrismaClient } = {},
): RealtimeServer {
  const prisma = deps.prisma ?? defaultPrisma;
  const pubClient = createRedisConnection();
  const subClient = createRedisConnection();

  const io: ArbiterIoServer = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });
  io.adapter(createAdapter(pubClient, subClient, { key: env.SOCKET_IO_KEY }));

  io.use((socket, next) => {
    socket.data.contests = new Map();
    const token: unknown = socket.handshake.auth?.token;
    if (token === undefined || token === null || token === '') {
      next();
      return;
    }
    try {
      if (typeof token !== 'string') throw new Error('token must be a string');
      const claims = verifyAccessToken(token);
      socket.data.user = { id: claims.sub, username: claims.username, role: claims.role };
      const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
      if (typeof exp === 'number') socket.data.expiresAt = exp * 1000;
      next();
    } catch {
      next(new Error(SOCKET_AUTH_ERROR));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) void socket.join(rooms.user(user.id));
    if (socket.data.expiresAt !== undefined) {
      // The token was checked once, at the handshake: end the connection when it expires. The
      // client reconnects with its refreshed token (a stale one fails with UNAUTHORIZED first).
      const timer = setTimeout(
        () => socket.disconnect(true),
        Math.min(Math.max(socket.data.expiresAt - Date.now(), 0), MAX_TIMER_MS),
      );
      timer.unref();
      socket.once('disconnect', () => clearTimeout(timer));
    }
    limitEvents(socket);
    registerRoomHandlers(socket, prisma);
  });

  return {
    io,
    async close() {
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
}
