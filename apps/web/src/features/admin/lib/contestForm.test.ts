import { describe, expect, it } from 'vitest';
import type { AdminContest } from '@arbiter/shared';
import {
  contestFormToBody,
  contestToForm,
  emptyContestForm,
  nextLabel,
  type ContestFormState,
} from './contestForm';

const base = (): ContestFormState => ({
  ...emptyContestForm(Date.UTC(2026, 10, 8, 12, 30)),
  slug: 'autumn-sprint',
  title: 'Autumn Sprint',
  problems: [
    { problemId: 'p1', label: 'a', slug: 'x', title: 'X' },
    { problemId: 'p2', label: 'B', slug: 'y', title: 'Y' },
  ],
});

describe('nextLabel', () => {
  it('returns the first unused letter, then two-letter labels', () => {
    expect(nextLabel([])).toBe('A');
    expect(nextLabel(['A', 'B', 'D'])).toBe('C');
    expect(nextLabel('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBe('AA');
  });
});

describe('contestFormToBody', () => {
  it('converts local times to ISO and upper-cases labels in problem order', () => {
    const result = contestFormToBody(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.problems).toEqual([
      { problemId: 'p1', label: 'A' },
      { problemId: 'p2', label: 'B' },
    ]);
    expect(Date.parse(result.body.endsAt) - Date.parse(result.body.startsAt)).toBe(2 * 3_600_000);
    expect(result.body.penaltyMinutes).toBe(20);
  });

  it('reports an end before the start and duplicate labels by field', () => {
    const form = base();
    form.endsAt = form.startsAt;
    form.problems[1] = { problemId: 'p2', label: 'A', slug: 'y', title: 'Y' };
    const result = contestFormToBody(form);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.endsAt).toMatch(/after/);
    expect(result.errors['problems.1.label']).toMatch(/Duplicate label A/);
  });

  it('asks for a number when the penalty is empty', () => {
    const result = contestFormToBody({ ...base(), penaltyMinutes: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.penaltyMinutes).toBe('Enter a number');
  });

  it('asks for the times when they are empty', () => {
    const result = contestFormToBody({ ...base(), startsAt: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startsAt).toBe('Pick a start time');
  });
});

describe('contestToForm round trip', () => {
  const contest = {
    slug: 'weekly',
    title: 'Weekly',
    descriptionMd: 'old',
    startsAt: '2026-11-11T09:41:47.318Z',
    endsAt: '2026-11-11T10:41:47.318Z',
    penaltyMinutes: 20,
    isPublished: true,
    problems: [],
  } as unknown as AdminContest;

  it('keeps the original start and end when the times are not edited', () => {
    const form = { ...contestToForm(contest), descriptionMd: 'new' };
    const result = contestFormToBody(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.startsAt).toBe(contest.startsAt);
    expect(result.body.endsAt).toBe(contest.endsAt);
  });

  it('uses the picker value once a time is edited', () => {
    const form = { ...contestToForm(contest), endsAt: '2026-11-11T23:30' };
    const result = contestFormToBody(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.startsAt).toBe(contest.startsAt);
    expect(result.body.endsAt).toBe(new Date('2026-11-11T23:30').toISOString());
  });
});
