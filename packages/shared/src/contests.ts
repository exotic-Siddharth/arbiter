import { z } from 'zod';
import {
  ContestStatusSchema,
  IsoDateTime,
  NonNegativeInt,
  PageQuery,
  UserProblemStatusSchema,
  booleanQuery,
} from './common';
import { LIMITS } from './constants';

export const ContestSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  status: ContestStatusSchema,
  problemCount: NonNegativeInt,
  /** Number of registered users. */
  participantCount: NonNegativeInt,
  /** false for guests. */
  isRegistered: z.boolean(),
  /** Ratings have been applied (Contest.ratedAt is set). */
  rated: z.boolean(),
});
export type ContestSummary = z.infer<typeof ContestSummarySchema>;
export const ContestListSchema = z.array(ContestSummarySchema);

export const ContestProblemItemSchema = z.object({
  label: z.string(),
  title: z.string(),
  slug: z.string(),
  solvedCount: NonNegativeInt,
  attemptedCount: NonNegativeInt,
  userStatus: UserProblemStatusSchema.nullable(),
});
export type ContestProblemItem = z.infer<typeof ContestProblemItemSchema>;

/** GET /api/contests/:slug */
export const ContestDetailSchema = ContestSummarySchema.extend({
  descriptionMd: z.string(),
  penaltyMinutes: NonNegativeInt,
  /** Server clock (ISO) so the client can correct countdowns for clock skew. */
  serverTime: IsoDateTime,
  /** null before startsAt for non-admins. */
  problems: z.array(ContestProblemItemSchema).nullable(),
});
export type ContestDetail = z.infer<typeof ContestDetailSchema>;

/** GET /api/contests?status=upcoming|running|past */
export const ListContestsQuery = z.object({
  status: z.enum(['upcoming', 'running', 'past']).optional(),
});
export type ListContestsQuery = z.infer<typeof ListContestsQuery>;

export const ScoreCellSchema = z.object({
  label: z.string(),
  solved: z.boolean(),
  /** Counted tries (not CE, not IE) before the first AC; all counted tries if unsolved. */
  attempts: NonNegativeInt,
  /** floor((acAt - startsAt) / 60 s); null if unsolved. */
  acMinute: NonNegativeInt.nullable(),
  /** Earliest AC on this problem in the contest. */
  firstSolve: z.boolean(),
  /** A submission on this problem is QUEUED/COMPILING/RUNNING. */
  pending: z.boolean(),
});
export type ScoreCell = z.infer<typeof ScoreCellSchema>;

export const ScoreRowSchema = z.object({
  /** 1 + number of rows with a strictly better (solved, penalty); ties share a rank. */
  rank: z.number().int().positive(),
  username: z.string(),
  rating: z.number().int(),
  solved: NonNegativeInt,
  penalty: NonNegativeInt,
  cells: z.array(ScoreCellSchema),
});
export type ScoreRow = z.infer<typeof ScoreRowSchema>;

/** GET /api/contests/:slug/scoreboard */
export const ScoreboardSchema = z.object({
  contestSlug: z.string(),
  problems: z.array(z.object({ label: z.string() })),
  rows: z.array(ScoreRowSchema),
  total: NonNegativeInt,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  updatedAt: IsoDateTime,
});
export type Scoreboard = z.infer<typeof ScoreboardSchema>;

/** ?page&pageSize (default pageSize 50 for scoreboards, max 100). */
export const ScoreboardQuery = PageQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(50),
});
export type ScoreboardQuery = z.infer<typeof ScoreboardQuery>;
export type ScoreboardQueryInput = z.input<typeof ScoreboardQuery>;

/** GET /api/contests/:slug/submissions?mine=true&page&pageSize */
export const ContestSubmissionsQuery = PageQuery.extend({
  mine: booleanQuery.optional(),
});
export type ContestSubmissionsQuery = z.infer<typeof ContestSubmissionsQuery>;
export type ContestSubmissionsQueryInput = z.input<typeof ContestSubmissionsQuery>;
