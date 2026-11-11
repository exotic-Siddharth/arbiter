import { chance, int, pick, range, shuffled, type Rng } from './rng';

/**
 * Pure planning of the seeded submission history (spec section 14): which user submits to which
 * problem, when, and with what verdict. Stronger users (higher `skill`) solve more, faster and with
 * fewer wrong attempts, so the scoreboards and the leaderboard look like real contests. Nothing
 * here touches the database; seed.ts turns the plans into rows.
 */

export type Outcome = 'AC' | 'WA' | 'TLE' | 'CE';
export type FailKind = 'WA' | 'TLE';

export interface SimUser {
  key: string;
  /** 0..1 */
  skill: number;
}

export interface SimProblem {
  slug: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  /** The failing demo programs the problem ships (wrong.py gives WA, slow.py gives TLE). */
  failures: readonly FailKind[];
}

/** Difficulty as 0..1, used against the user's skill. */
export const DIFFICULTY_SCORE = { EASY: 0.15, MEDIUM: 0.5, HARD: 0.88 } as const;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

function failOutcome(rng: Rng, problem: SimProblem): Outcome {
  if (chance(rng, 0.12)) return 'CE';
  return pick(rng, problem.failures.length > 0 ? problem.failures : (['WA'] as const));
}

export interface ContestAttempt {
  user: string;
  problem: string;
  /** Minutes after the contest start (seconds resolution). */
  minute: number;
  outcome: Outcome;
}

/**
 * One contest: every user works through the problems roughly in label order, spending
 * (difficulty x weakness) minutes on each, with some wrong attempts on the way. The first user
 * attempt after the duration is dropped, so every attempt is inside the window.
 */
export function simulateContest(
  rng: Rng,
  users: readonly SimUser[],
  problems: readonly SimProblem[],
  durationMin: number,
  /** The window the attempts may fall in; defaults to the whole contest. */
  windowMin: { from: number; to: number } = { from: 0, to: durationMin },
): ContestAttempt[] {
  const attempts: ContestAttempt[] = [];
  const span = windowMin.to - windowMin.from;
  for (const user of users) {
    let cursor = range(rng, 0, Math.min(8, span * 0.15));
    const order = [...problems];
    for (let i = 0; i + 1 < order.length; i += 1) {
      if (chance(rng, 0.2)) [order[i], order[i + 1]] = [order[i + 1], order[i]];
    }
    for (const problem of order) {
      if (cursor >= span - 1) break;
      const difficulty = DIFFICULTY_SCORE[problem.difficulty];
      const ability = user.skill - difficulty;
      const tries = clamp(0.4 + 0.75 * user.skill + (0.3 - difficulty) * 0.4, 0.15, 0.97);
      if (!chance(rng, tries)) continue;
      const solves = chance(rng, sigmoid(7 * ability + 0.9));
      const fails = solves
        ? chance(rng, 0.55 + 0.35 * user.skill)
          ? 0
          : int(rng, 1, 2)
        : int(rng, 1, 3);
      const duration = (6 + 36 * difficulty) * (1.6 - user.skill) * range(rng, 0.6, 1.4);
      const total = solves ? fails + 1 : fails;
      for (let k = 0; k < total; k += 1) {
        const minute = cursor + (duration * (k + 1)) / (fails + 1);
        if (minute >= span - 0.5) break;
        const outcome: Outcome = solves && k === total - 1 ? 'AC' : failOutcome(rng, problem);
        attempts.push({
          user: user.key,
          problem: problem.slug,
          minute: windowMin.from + Math.round(minute * 20) / 20,
          outcome,
        });
      }
      cursor += duration;
    }
  }
  // Everyone in the list submitted at least once (a registrant who never submits is not rated).
  for (const user of users) {
    if (attempts.some((a) => a.user === user.key)) continue;
    attempts.push({
      user: user.key,
      problem: problems[0].slug,
      minute: windowMin.from + Math.round(range(rng, 2, Math.max(3, span * 0.4)) * 20) / 20,
      outcome: failOutcome(rng, problems[0]),
    });
  }
  return attempts.sort((a, b) => a.minute - b.minute || a.user.localeCompare(b.user));
}

export interface PracticeProblem extends SimProblem {
  /** The problem is only open for practice from this time on (published). */
  availableFrom: Date;
}

export interface PracticeAttempt {
  user: string;
  problem: string;
  at: Date;
  outcome: Outcome;
}

const DAY_MS = 86_400_000;

export interface PracticeOptions {
  now: Date;
  /** How far back activity reaches, in days. */
  horizonDays: number;
}

/**
 * Practice history outside contests: each user is active on some days (more days for stronger
 * users, more recent days more likely), works on a problem they have not solved yet, and
 * occasionally re-submits a solved one (a C++ port, an optimisation).
 */
export function simulatePractice(
  rng: Rng,
  users: readonly (SimUser & { activeDays?: number })[],
  problems: readonly PracticeProblem[],
  { now, horizonDays }: PracticeOptions,
): PracticeAttempt[] {
  const attempts: PracticeAttempt[] = [];
  for (const user of users) {
    const dayCount = Math.min(
      user.activeDays ?? Math.round(5 + user.skill * 22 + range(rng, 0, 8)),
      Math.floor(horizonDays * 0.6),
    );
    const offsets = new Set<number>();
    while (offsets.size < dayCount) offsets.add(Math.floor(Math.pow(rng(), 1.7) * horizonDays));
    const times = [...offsets]
      .map((daysAgo) => {
        const hour = pick(rng, [8, 9, 10, 11, 14, 15, 16, 18, 19, 20, 21, 22, 23]);
        const day = new Date(now.getTime() - daysAgo * DAY_MS);
        day.setUTCHours(hour, int(rng, 0, 59), int(rng, 0, 59), 0);
        return day;
      })
      .filter((time) => time < now)
      .sort((a, b) => a.getTime() - b.getTime());
    const solved = new Set<string>();
    for (const day of times) {
      const open = problems.filter((p) => p.availableFrom <= day);
      if (open.length === 0) continue;
      const fresh = open.filter((p) => !solved.has(p.slug));
      let problem: PracticeProblem;
      if (fresh.length > 0 && !chance(rng, 0.12)) problem = pick(rng, fresh);
      else problem = pick(rng, open);
      let at = day.getTime();
      if (solved.has(problem.slug)) {
        attempts.push({ user: user.key, problem: problem.slug, at: new Date(at), outcome: 'AC' });
        continue;
      }
      const difficulty = DIFFICULTY_SCORE[problem.difficulty];
      const solves = chance(rng, sigmoid(5 * (user.skill - difficulty) + 0.8));
      const fails = solves ? int(rng, 0, 2) : int(rng, 1, 3);
      for (let k = 0; k < fails; k += 1) {
        attempts.push({
          user: user.key,
          problem: problem.slug,
          at: new Date(at),
          outcome: failOutcome(rng, problem),
        });
        at += int(rng, 2, 25) * 60_000;
      }
      if (solves) {
        attempts.push({ user: user.key, problem: problem.slug, at: new Date(at), outcome: 'AC' });
        solved.add(problem.slug);
      }
    }
  }
  return attempts.filter((a) => a.at < now).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** A few very recent practice submissions, so the landing page feed and the judge monitor are alive. */
export function simulateRecent(
  rng: Rng,
  users: readonly SimUser[],
  problems: readonly PracticeProblem[],
  now: Date,
  count: number,
): PracticeAttempt[] {
  const attempts: PracticeAttempt[] = [];
  const open = problems.filter((p) => p.availableFrom < now);
  for (const user of shuffled(rng, users).slice(0, count)) {
    const problem = pick(rng, open);
    const outcome = chance(rng, 0.6) ? 'AC' : failOutcome(rng, problem);
    attempts.push({
      user: user.key,
      problem: problem.slug,
      at: new Date(now.getTime() - int(rng, 90, 170 * 60) * 1000),
      outcome,
    });
  }
  return attempts;
}
