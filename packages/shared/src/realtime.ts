import { z } from 'zod';
import {
  Id,
  IsoDateTime,
  LanguageSchema,
  NonNegativeInt,
  SubmissionStatusSchema,
  VerdictSchema,
} from './common';
import { ScoreRowSchema } from './contests';
import { RunResultSchema, type RunResult } from './runs';

// ---------------------------------------------------------------------------
// Server -> client payloads (spec section 11). Events are hints; REST stays the source of truth.
// ---------------------------------------------------------------------------

/** -> room submission:<id> */
export const SubmissionStatusEventSchema = z.object({
  id: Id,
  status: SubmissionStatusSchema,
  testsDone: NonNegativeInt,
  testsTotal: NonNegativeInt,
});
export type SubmissionStatusEvent = z.infer<typeof SubmissionStatusEventSchema>;

/** -> room submission:<id>, once per executed test, in ordinal order. */
export const SubmissionTestEventSchema = z.object({
  id: Id,
  ordinal: z.number().int().positive(),
  verdict: VerdictSchema,
  timeMs: NonNegativeInt,
  memoryKb: NonNegativeInt,
  isSample: z.boolean(),
});
export type SubmissionTestEvent = z.infer<typeof SubmissionTestEventSchema>;

/** -> rooms submission:<id> and user:<ownerId> */
export const SubmissionDoneEventSchema = z.object({
  id: Id,
  status: SubmissionStatusSchema,
  verdict: VerdictSchema.nullable(),
  timeMs: z.number().int().nullable(),
  memoryKb: z.number().int().nullable(),
  testsPassed: NonNegativeInt,
  testsTotal: NonNegativeInt,
});
export type SubmissionDoneEvent = z.infer<typeof SubmissionDoneEventSchema>;

/** -> room contest:<contestId>. Clients re-rank locally. */
export const ScoreboardRowEventSchema = z.object({
  contestSlug: z.string(),
  row: ScoreRowSchema,
});
export type ScoreboardRowEvent = z.infer<typeof ScoreboardRowEventSchema>;

/** -> room feed (published problems, practice submissions only; never during-contest submissions). */
export const FeedJudgedEventSchema = z.object({
  username: z.string(),
  problemSlug: z.string(),
  problemTitle: z.string(),
  language: LanguageSchema,
  verdict: VerdictSchema,
  timeMs: z.number().int().nullable(),
  at: IsoDateTime,
});
export type FeedJudgedEvent = z.infer<typeof FeedJudgedEventSchema>;

/** `run:result` -> room user:<id> carries a RunResult (see runs.ts). */
export const RunResultEventSchema = RunResultSchema;

export interface ServerToClientEvents {
  'submission:status': (payload: SubmissionStatusEvent) => void;
  'submission:test': (payload: SubmissionTestEvent) => void;
  'submission:done': (payload: SubmissionDoneEvent) => void;
  'run:result': (payload: RunResult) => void;
  'scoreboard:row': (payload: ScoreboardRowEvent) => void;
  'feed:judged': (payload: FeedJudgedEvent) => void;
}

export type ServerEventName = keyof ServerToClientEvents;

/** zod schema per server event (the API emitter validates every payload with these). */
export const ServerEventSchemas = {
  'submission:status': SubmissionStatusEventSchema,
  'submission:test': SubmissionTestEventSchema,
  'submission:done': SubmissionDoneEventSchema,
  'run:result': RunResultEventSchema,
  'scoreboard:row': ScoreboardRowEventSchema,
  'feed:judged': FeedJudgedEventSchema,
} as const satisfies Record<ServerEventName, z.ZodTypeAny>;

// ---------------------------------------------------------------------------
// Client -> server (room membership). Every handler answers through the optional ack.
// ---------------------------------------------------------------------------

/** submission:subscribe / submission:unsubscribe (subscribe: owner or admin only). */
export const SubmissionRoomPayload = z.object({ id: Id });
export type SubmissionRoomPayload = z.infer<typeof SubmissionRoomPayload>;

/** contest:subscribe / contest:unsubscribe (joins contest:<contestId>). */
export const ContestRoomPayload = z.object({ slug: z.string().min(1).max(100) });
export type ContestRoomPayload = z.infer<typeof ContestRoomPayload>;

/** {ok:true} or {ok:false, error} where error is an ErrorCode such as NOT_FOUND or FORBIDDEN. */
export const SocketAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type SocketAck = z.infer<typeof SocketAckSchema>;
export type AckCallback = (ack: SocketAck) => void;

export interface ClientToServerEvents {
  'submission:subscribe': (payload: SubmissionRoomPayload, ack?: AckCallback) => void;
  'submission:unsubscribe': (payload: SubmissionRoomPayload, ack?: AckCallback) => void;
  'contest:subscribe': (payload: ContestRoomPayload, ack?: AckCallback) => void;
  'contest:unsubscribe': (payload: ContestRoomPayload, ack?: AckCallback) => void;
  'feed:subscribe': (ack?: AckCallback) => void;
  'feed:unsubscribe': (ack?: AckCallback) => void;
}

export type ClientEventName = keyof ClientToServerEvents;

/**
 * Error message of the `connect_error` the server raises when the handshake token is
 * invalid or expired. The client should refresh its access token and reconnect
 * (or reconnect without a token as a guest).
 */
export const SOCKET_AUTH_ERROR = 'UNAUTHORIZED';
