import { z } from 'zod';
import {
  DateKey,
  DifficultySchema,
  IsoDateTime,
  LanguageSchema,
  NonNegativeInt,
  PageQuery,
  pageSchema,
} from './common';
import { LIMITS } from './constants';

/** PATCH /api/users/me (null or "" clears the bio). */
export const PatchMeBody = z.object({
  bio: z
    .string()
    .trim()
    .max(LIMITS.bioMaxChars, `Bio must be at most ${LIMITS.bioMaxChars} characters`)
    .nullable(),
});
export type PatchMeBody = z.infer<typeof PatchMeBody>;

const DifficultyCounts = z.object({
  EASY: NonNegativeInt,
  MEDIUM: NonNegativeInt,
  HARD: NonNegativeInt,
});

/** GET /api/users/:username */
export const ProfileSchema = z.object({
  user: z.object({
    username: z.string(),
    rating: z.number().int(),
    bio: z.string().nullable(),
    createdAt: IsoDateTime,
  }),
  stats: z.object({
    solved: DifficultyCounts.extend({ total: NonNegativeInt }),
    available: DifficultyCounts,
    submissions: NonNegativeInt,
    accepted: NonNegativeInt,
    /** 0..1 */
    acceptanceRate: z.number().min(0).max(1),
    languages: z.array(z.object({ language: LanguageSchema, count: NonNegativeInt })),
    /** Rank by rating among all users; null when unranked. */
    globalRank: z.number().int().positive().nullable(),
  }),
  /** Exactly the last 365 UTC days, oldest first. */
  heatmap: z.array(z.object({ date: DateKey, count: NonNegativeInt })),
  ratingHistory: z.array(
    z.object({
      contestSlug: z.string(),
      contestTitle: z.string(),
      oldRating: z.number().int(),
      newRating: z.number().int(),
      rank: z.number().int().positive(),
      date: IsoDateTime,
    }),
  ),
  /** At most 10, newest first. */
  recentAccepted: z
    .array(
      z.object({
        problemSlug: z.string(),
        title: z.string(),
        difficulty: DifficultySchema,
        at: IsoDateTime,
      }),
    )
    .max(10),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** GET /api/leaderboard?by=rating|solved&page&pageSize */
export const LeaderboardQuery = PageQuery.extend({
  by: z.enum(['rating', 'solved']).default('rating'),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuery>;
export type LeaderboardQueryInput = z.input<typeof LeaderboardQuery>;

export const LeaderboardEntrySchema = z.object({
  /** Ties share a rank. */
  rank: z.number().int().positive(),
  username: z.string(),
  rating: z.number().int(),
  /** Distinct problems with an AC (NORMAL submissions only). */
  solved: NonNegativeInt,
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export const LeaderboardPageSchema = pageSchema(LeaderboardEntrySchema);
export type LeaderboardPage = z.infer<typeof LeaderboardPageSchema>;

/** GET /api/stats */
export const StatsSchema = z.object({
  problems: NonNegativeInt,
  users: NonNegativeInt,
  submissions: NonNegativeInt,
  judgedToday: NonNegativeInt,
  runningContests: NonNegativeInt,
});
export type Stats = z.infer<typeof StatsSchema>;
