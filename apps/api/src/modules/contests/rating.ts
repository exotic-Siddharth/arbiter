/**
 * Pairwise Elo (spec section 9). Pure; the admin rate route and the seed both use it.
 *   S_ij = 1 if i ranked better, 0.5 if tied, 0 otherwise
 *   E_ij = 1 / (1 + 10^((R_j - R_i) / 400))
 *   delta_i = round(64 * sum_{j != i} (S_ij - E_ij) / (N - 1))
 */

export interface RatingParticipant {
  userId: string;
  /** Pre-contest rating. */
  rating: number;
  /** Final rank (1 = best; ties share a rank). */
  rank: number;
}

export const RATING_K = 64;

/** Rating delta per userId. N < 2 gives 0 to everyone. */
export function computeRatingDeltas(
  participants: readonly RatingParticipant[],
): Map<string, number> {
  const deltas = new Map<string, number>();
  const n = participants.length;
  if (n < 2) {
    for (const p of participants) deltas.set(p.userId, 0);
    return deltas;
  }
  for (const i of participants) {
    let total = 0;
    for (const j of participants) {
      if (i === j) continue;
      const actual = i.rank < j.rank ? 1 : i.rank === j.rank ? 0.5 : 0;
      const expected = 1 / (1 + 10 ** ((j.rating - i.rating) / 400));
      total += actual - expected;
    }
    // `+ 0` turns a rounded -0 into 0.
    deltas.set(i.userId, Math.round((RATING_K * total) / (n - 1)) + 0);
  }
  return deltas;
}
