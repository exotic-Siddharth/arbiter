import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeServerOffset } from '@/lib/time';
import { Countdown } from './Countdown';

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-08T10:00:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to the target corrected by the server clock offset', () => {
    // The server clock is 30 s ahead of this client, so 60 s of client time is 30 s of contest.
    render(<Countdown to="2026-11-08T10:01:00.000Z" serverOffsetMs={30_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:30');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:29');
  });

  it('derives the offset from serverTime and the response time', () => {
    const receivedAt = Date.parse('2026-11-08T10:00:00.000Z');
    expect(computeServerOffset('2026-11-08T10:00:05.000Z', receivedAt)).toBe(5000);
    expect(computeServerOffset('not a date', receivedAt)).toBe(0);
  });

  it('shows days for long countdowns and a spoken label', () => {
    render(<Countdown to="2026-11-11T13:04:05.000Z" label="until the start" />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('3d 03:04:05');
    expect(timer).toHaveAccessibleName('3 days 3 hours 4 minutes until the start');
  });

  it('stops at zero and calls onComplete once', () => {
    const onComplete = vi.fn();
    render(<Countdown to="2026-11-08T10:00:02.000Z" onComplete={onComplete} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('00:00:00');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
