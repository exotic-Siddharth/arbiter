import { describe, expect, it } from 'vitest';
import {
  describeDuration,
  formatCountdown,
  formatDuration,
  formatMemoryKb,
  formatMs,
  formatPercent,
  formatRelativeTime,
  initials,
  pluralize,
} from './format';

describe('format helpers', () => {
  it('formats judge times and memory', () => {
    expect(formatMs(12)).toBe('12 ms');
    expect(formatMs(1534)).toBe('1.53 s');
    expect(formatMs(null)).toBe('—');
    expect(formatMemoryKb(812)).toBe('812 KB');
    expect(formatMemoryKb(3456)).toBe('3.4 MB');
  });

  it('formats ratios, durations and countdowns', () => {
    expect(formatPercent(0.4567)).toBe('45.7%');
    expect(formatPercent(0.5, 0)).toBe('50%');
    expect(formatDuration(5_400_000)).toBe('1h 30m');
    expect(formatDuration(14 * 86_400_000)).toBe('14d');
    expect(formatCountdown(3_723_000)).toBe('01:02:03');
    expect(formatCountdown(90_061_000)).toBe('1d 01:01:01');
    expect(formatCountdown(-5)).toBe('00:00:00');
    expect(describeDuration(90_061_000)).toBe('1 day 1 hour 1 minute');
  });

  it('formats relative times against the given clock', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(formatRelativeTime('2026-11-08T11:57:00Z', now)).toBe('3 minutes ago');
    expect(formatRelativeTime('2026-11-08T11:59:55Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-11-10T12:00:00Z', now)).toBe('in 2 days');
  });

  it('pluralises and builds initials', () => {
    expect(pluralize(1, 'test')).toBe('1 test');
    expect(pluralize(1200, 'test')).toBe('1,200 tests');
    expect(initials('demo')).toBe('DE');
    expect(initials('ada_lovelace')).toBe('AL');
    expect(initials('GraceHopper')).toBe('GH');
  });
});
