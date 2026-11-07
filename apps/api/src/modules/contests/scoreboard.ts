/* eslint-disable @typescript-eslint/no-unused-vars -- scaffold stub: lane A3 implements these (keep the signatures) */
import type { ScoreRow, Scoreboard } from '@arbiter/shared';

/**
 * ICPC scoreboard cache (spec section 9, resolution R3). Redis keys:
 *   contest:<id>:rank  ZSET  score = solved * 10^7 - penalty
 *   contest:<id>:rows  HASH  userId -> row JSON
 * Owner: lane A3.
 */

/**
 * Rebuild one user's row from Postgres, write the ZSET + HASH and return the row (null when the
 * user is not a participant). rank = 1 + number of rows with a strictly higher score. Callers emit
 * emitter.emitScoreboardRow(contestId, { contestSlug, row }).
 */
export async function recomputeRow(contestId: string, userId: string): Promise<ScoreRow | null> {
  throw new Error('not implemented: recomputeRow');
}

/** Recompute every row of a contest under a Redis lock (used when the keys are missing). */
export async function rebuildScoreboard(contestId: string): Promise<void> {
  throw new Error('not implemented: rebuildScoreboard');
}

/** Page of the ranked scoreboard (rebuilds first if the keys are missing). */
export async function getScoreboard(
  contestId: string,
  page: number,
  pageSize: number,
): Promise<Scoreboard> {
  throw new Error('not implemented: getScoreboard');
}
