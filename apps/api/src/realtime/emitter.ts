import {
  ServerEventSchemas,
  type FeedJudgedEvent,
  type RunResult,
  type ScoreboardRowEvent,
  type ServerEventName,
  type ServerToClientEvents,
  type SubmissionDoneEvent,
  type SubmissionStatusEvent,
  type SubmissionTestEvent,
} from '@arbiter/shared';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { onShutdown } from '../lib/lifecycle';
import { createRedisConnection } from '../lib/redis';
import { rooms } from './rooms';

let client: Redis | undefined;
let instance: Emitter<ServerToClientEvents> | undefined;

function getEmitter(): Emitter<ServerToClientEvents> {
  if (!instance) {
    client = createRedisConnection();
    // Same key as the adapter in io.ts (R6): Redis pub/sub ignores DB numbers.
    instance = new Emitter<ServerToClientEvents>(client, { key: env.SOCKET_IO_KEY });
    onShutdown('socket-emitter', closeEmitter);
  }
  return instance;
}

function emitTo<E extends ServerEventName>(
  target: string | string[],
  event: E,
  payload: Parameters<ServerToClientEvents[E]>[0],
): void {
  // Validate every payload against its shared zod schema; a mismatch is a programming error.
  const data = ServerEventSchemas[event].parse(payload) as Parameters<ServerToClientEvents[E]>[0];
  const args = [data] as Parameters<ServerToClientEvents[E]>;
  getEmitter()
    .to(target)
    .emit(event, ...args);
}

/**
 * Socket.IO emitter usable from any process (API and worker) through Redis. Events are hints:
 * clients refetch over REST, which stays the source of truth. Tests can vi.spyOn(emitter, ...).
 */
export const emitter = {
  /** -> submission:<id> */
  emitSubmissionStatus(payload: SubmissionStatusEvent): void {
    emitTo(rooms.submission(payload.id), 'submission:status', payload);
  },
  /** -> submission:<id> */
  emitSubmissionTest(payload: SubmissionTestEvent): void {
    emitTo(rooms.submission(payload.id), 'submission:test', payload);
  },
  /** -> submission:<id> and user:<ownerId> */
  emitSubmissionDone(payload: SubmissionDoneEvent, ownerId: string): void {
    emitTo([rooms.submission(payload.id), rooms.user(ownerId)], 'submission:done', payload);
  },
  /** -> user:<userId> */
  emitRunResult(userId: string, result: RunResult): void {
    emitTo(rooms.user(userId), 'run:result', result);
  },
  /** -> contest:<contestId> (R3: after a contest submission is created and on every terminal outcome) */
  emitScoreboardRow(contestId: string, payload: ScoreboardRowEvent): void {
    emitTo(rooms.contest(contestId), 'scoreboard:row', payload);
  },
  /** -> feed (published problems and practice submissions only) */
  emitFeedJudged(payload: FeedJudgedEvent): void {
    emitTo(rooms.feed, 'feed:judged', payload);
  },
};

export type SocketEmitter = typeof emitter;

/** Close the emitter's Redis connection (a later emit opens a new one). */
export async function closeEmitter(): Promise<void> {
  const current = client;
  client = undefined;
  instance = undefined;
  if (current) await current.quit().catch(() => current.disconnect());
}
