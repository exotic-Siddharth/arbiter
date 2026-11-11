import type { ScoreCell, ScoreRow, SubmissionStatus, Verdict } from '@arbiter/shared';
import { MINUTE_MS } from '../../lib/time';

/**
 * Pure ICPC scoring (spec section 9, resolution R3). No I/O: the scoreboard cache
 * (scoreboard.ts) loads the data and stores the rows.
 */

export interface ScoringContest {
  startsAt: Date;
  penaltyMinutes: number;
  /** In label order. */
  problems: readonly { problemId: string; label: string }[];
  /** Earliest AC time per problemId (see firstSolveTimes); missing = no first solves marked. */
  firstSolveAt?: ReadonlyMap<string, Date>;
}

export interface ScoringSubmission {
  id: string;
  userId: string;
  problemId: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  createdAt: Date;
  user: { username: string; rating: number };
}

/** A scoreboard row plus the user id it belongs to (the id is never sent to clients). */
export type UserScoreRow = ScoreRow & { userId: string };

const PENDING_STATUSES: ReadonlySet<SubmissionStatus> = new Set(['QUEUED', 'COMPILING', 'RUNNING']);

const isPending = (s: Pick<ScoringSubmission, 'status'>) => PENDING_STATUSES.has(s.status);

const isAccepted = (s: Pick<ScoringSubmission, 'status' | 'verdict'>) =>
  s.status === 'DONE' && s.verdict === 'AC';

/** A judged, non-AC try that counts for the penalty: CE and IE (and FAILED) never count. */
const isCountedWrong = (s: Pick<ScoringSubmission, 'status' | 'verdict'>) =>
  s.status === 'DONE' && s.verdict !== null && !['AC', 'CE', 'IE'].includes(s.verdict);

const byTime = (a: ScoringSubmission, b: ScoringSubmission) =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const SCORE_BASE = 10_000_000;

/**
 * Redis ZSET score: solved x 10^7 - penalty (higher is better). The penalty is clamped below the
 * base so that one more solved problem always outranks any penalty, however long the contest.
 */
export function scoreOf(row: { solved: number; penalty: number }): number {
  return row.solved * SCORE_BASE - Math.min(row.penalty, SCORE_BASE - 1);
}

/** Earliest AC time per problemId over every participant's submissions. */
export function firstSolveTimes(submissions: readonly ScoringSubmission[]): Map<string, Date> {
  const firsts = new Map<string, Date>();
  for (const s of submissions) {
    if (!isAccepted(s)) continue;
    const current = firsts.get(s.problemId);
    if (!current || s.createdAt.getTime() < current.getTime()) firsts.set(s.problemId, s.createdAt);
  }
  return firsts;
}

/**
 * One participant's row from all of their contest submissions (any order). `rank` is a
 * placeholder (1): rankRows or the scoreboard cache sets the real rank.
 */
export function computeRow(
  contest: ScoringContest,
  submissions: readonly ScoringSubmission[],
): UserScoreRow {
  const first = submissions[0];
  if (!first) throw new Error('computeRow needs at least one submission');
  if (submissions.some((s) => s.userId !== first.userId)) {
    throw new Error('computeRow takes the submissions of one participant only');
  }

  const sorted = [...submissions].sort(byTime);
  let solved = 0;
  let penalty = 0;
  const cells: ScoreCell[] = contest.problems.map(({ problemId, label }) => {
    let attempts = 0;
    let pending = false;
    let acAt: Date | null = null;
    for (const s of sorted) {
      if (s.problemId !== problemId) continue;
      if (isAccepted(s)) {
        acAt = s.createdAt;
        break; // everything after the first AC is ignored
      }
      if (isPending(s)) pending = true;
      else if (isCountedWrong(s)) attempts += 1;
    }
    if (!acAt)
      return { label, solved: false, attempts, acMinute: null, firstSolve: false, pending };
    const acMinute = Math.max(
      0,
      Math.floor((acAt.getTime() - contest.startsAt.getTime()) / MINUTE_MS),
    );
    solved += 1;
    penalty += acMinute + contest.penaltyMinutes * attempts;
    const firstAt = contest.firstSolveAt?.get(problemId);
    const firstSolve = firstAt !== undefined && firstAt.getTime() === acAt.getTime();
    return { label, solved: true, attempts, acMinute, firstSolve, pending };
  });

  return {
    userId: first.userId,
    rank: 1,
    username: first.user.username,
    rating: first.user.rating,
    solved,
    penalty,
    cells,
  };
}

/**
 * Sorted by solved desc, penalty asc (then username); rank = 1 + number of rows with a strictly
 * better (solved, penalty), so ties share a rank. Returns new objects; extra fields are kept.
 */
export function rankRows<T extends ScoreRow>(rows: readonly T[]): T[] {
  const sorted = [...rows].sort(
    (a, b) => scoreOf(b) - scoreOf(a) || a.username.localeCompare(b.username),
  );
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((row, index) => {
    const score = scoreOf(row);
    if (score !== previous) {
      rank = index + 1;
      previous = score;
    }
    return { ...row, rank };
  });
}

/** The full ranked scoreboard from every participant's contest submissions. */
export function computeStandings(
  contest: ScoringContest,
  submissions: readonly ScoringSubmission[],
): UserScoreRow[] {
  const withFirsts: ScoringContest = {
    ...contest,
    firstSolveAt: contest.firstSolveAt ?? firstSolveTimes(submissions),
  };
  const byUser = new Map<string, ScoringSubmission[]>();
  for (const s of submissions) {
    const list = byUser.get(s.userId);
    if (list) list.push(s);
    else byUser.set(s.userId, [s]);
  }
  return rankRows([...byUser.values()].map((list) => computeRow(withFirsts, list)));
}
