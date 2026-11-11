import type { ContestStatus } from '@arbiter/shared';

interface Schedule {
  startsAt: string;
  endsAt: string;
}

/** Contest status at a given server time (RUNNING while startsAt <= now < endsAt). */
export function contestPhase(contest: Schedule, serverNow: number): ContestStatus {
  if (serverNow < Date.parse(contest.startsAt)) return 'UPCOMING';
  if (serverNow < Date.parse(contest.endsAt)) return 'RUNNING';
  return 'ENDED';
}

export interface ContestBoundary {
  phase: ContestStatus;
  /** The next boundary (start or end), null once the contest has ended. */
  target: string | null;
  /** "Starts in" / "Ends in" / "Ended". */
  label: string;
  /** Spoken suffix for the countdown timer. */
  spoken: string;
}

export function contestBoundary(contest: Schedule, serverNow: number): ContestBoundary {
  const phase = contestPhase(contest, serverNow);
  if (phase === 'UPCOMING') {
    return { phase, target: contest.startsAt, label: 'Starts in', spoken: 'until the start' };
  }
  if (phase === 'RUNNING') {
    return { phase, target: contest.endsAt, label: 'Ends in', spoken: 'until the end' };
  }
  return { phase, target: null, label: 'Ended', spoken: '' };
}

/** Length of the contest in ms. */
export function contestLength(contest: Schedule): number {
  return Date.parse(contest.endsAt) - Date.parse(contest.startsAt);
}

/** 0..1 share of the contest that has elapsed (clamped). */
export function contestElapsed(contest: Schedule, serverNow: number): number {
  const length = contestLength(contest);
  if (length <= 0) return 1;
  return Math.min(1, Math.max(0, (serverNow - Date.parse(contest.startsAt)) / length));
}
