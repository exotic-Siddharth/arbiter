import { AdminContestBody, type AdminContest } from '@arbiter/shared';
import { isoToLocalInput, localInputToIso } from './datetime';
import { zodFieldErrors } from './zodErrors';

export interface ContestFormProblem {
  problemId: string;
  label: string;
  /** Display only (not sent). */
  slug: string;
  title: string;
}

/** Editable contest fields as the form holds them. Times are datetime-local strings. */
export interface ContestFormState {
  slug: string;
  title: string;
  descriptionMd: string;
  startsAt: string;
  endsAt: string;
  penaltyMinutes: string;
  isPublished: boolean;
  problems: ContestFormProblem[];
}

const HOUR_MS = 3_600_000;

/** A fresh contest: starts tomorrow on the hour and runs for two hours. */
export function emptyContestForm(now: number = Date.now()): ContestFormState {
  const start = Math.ceil((now + 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
  return {
    slug: '',
    title: '',
    descriptionMd: '',
    startsAt: isoToLocalInput(new Date(start).toISOString()),
    endsAt: isoToLocalInput(new Date(start + 2 * HOUR_MS).toISOString()),
    penaltyMinutes: '20',
    isPublished: false,
    problems: [],
  };
}

export function contestToForm(contest: AdminContest): ContestFormState {
  return {
    slug: contest.slug,
    title: contest.title,
    descriptionMd: contest.descriptionMd,
    startsAt: isoToLocalInput(contest.startsAt),
    endsAt: isoToLocalInput(contest.endsAt),
    penaltyMinutes: String(contest.penaltyMinutes),
    isPublished: contest.isPublished,
    problems: [...contest.problems]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((problem) => ({
        problemId: problem.problemId,
        label: problem.label,
        slug: problem.slug,
        title: problem.title,
      })),
  };
}

/** Labels A..Z, then AA..AZ: the first one no problem uses yet. */
export function nextLabel(used: readonly string[]): string {
  const taken = new Set(used.map((label) => label.toUpperCase()));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) if (!taken.has(letter)) return letter;
  for (const first of letters) {
    for (const second of letters) if (!taken.has(first + second)) return first + second;
  }
  return '';
}

export type ContestFormResult =
  { ok: true; body: AdminContestBody } | { ok: false; errors: Record<string, string> };

export function contestFormToBody(form: ContestFormState): ContestFormResult {
  const startsAt = localInputToIso(form.startsAt);
  const endsAt = localInputToIso(form.endsAt);
  const early: Record<string, string> = {};
  if (!startsAt) early.startsAt = 'Pick a start time';
  if (!endsAt) early.endsAt = 'Pick an end time';

  const parsed = AdminContestBody.safeParse({
    slug: form.slug.trim(),
    title: form.title,
    descriptionMd: form.descriptionMd,
    startsAt: startsAt ?? '',
    endsAt: endsAt ?? '',
    isPublished: form.isPublished,
    penaltyMinutes: form.penaltyMinutes.trim() === '' ? Number.NaN : Number(form.penaltyMinutes),
    problems: form.problems.map((problem) => ({
      problemId: problem.problemId,
      label: problem.label.trim().toUpperCase(),
    })),
  });
  if (parsed.success && Object.keys(early).length === 0) return { ok: true, body: parsed.data };

  const errors = parsed.success ? {} : zodFieldErrors(parsed.error);
  // Empty/invalid dates are reported by the picker message instead of "Invalid datetime".
  for (const key of Object.keys(early)) errors[key] = early[key] as string;
  if (errors.penaltyMinutes?.toLowerCase().includes('nan'))
    errors.penaltyMinutes = 'Enter a number';
  return { ok: false, errors };
}
