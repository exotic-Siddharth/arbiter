import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contestBoundary } from '../lib/contestClock';
import { contestDetail } from '../test/fixtures';
import { ContestHero } from './ContestHero';

describe('ContestHero', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-08T10:00:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances the elapsed bar with the clock, not only on refetch', () => {
    const now = Date.now();
    // Started 30 min ago, lasts 2 h: 25% elapsed now, 50% after another 30 min.
    const contest = contestDetail(now);
    render(
      <ContestHero
        contest={contest}
        boundary={contestBoundary(contest, now)}
        offsetMs={0}
        onBoundary={() => {}}
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Contest time elapsed' });
    expect(bar).toHaveAttribute('aria-valuetext', '25% of the contest elapsed');
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(bar).toHaveAttribute('aria-valuetext', '50% of the contest elapsed');
  });
});
