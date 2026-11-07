import type { ContestStatus } from '@arbiter/shared';

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/**
 * The app's clock. Tests can pin it with vi.spyOn(clock, 'now').mockReturnValue(date)
 * (or use vi.useFakeTimers(), which also moves `new Date()`).
 */
export const clock = {
  now: (): Date => new Date(),
};

export const toIso = (date: Date): string => date.toISOString();

export const toIsoOrNull = (date: Date | null | undefined): string | null =>
  date ? date.toISOString() : null;

/**
 * UPCOMING before startsAt, RUNNING while startsAt <= now < endsAt, ENDED from endsAt on
 * (a submission at endsAt + 1 ms is a practice submission).
 */
export function contestStatus(
  contest: { startsAt: Date; endsAt: Date },
  now: Date = clock.now(),
): ContestStatus {
  const t = now.getTime();
  if (t < contest.startsAt.getTime()) return 'UPCOMING';
  if (t < contest.endsAt.getTime()) return 'RUNNING';
  return 'ENDED';
}

/** Whole minutes from `from` to `to`, rounded down (ICPC acMinute). */
export const minutesBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / MINUTE_MS);

export const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * MINUTE_MS);

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** 00:00:00.000 UTC of the given day. */
export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** "YYYY-MM-DD" in UTC (profile heatmap keys). */
export const utcDayKey = (date: Date): string => date.toISOString().slice(0, 10);
