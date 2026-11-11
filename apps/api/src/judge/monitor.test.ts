import { describe, expect, it } from 'vitest';
import { bucketPerMinute, percentile } from './monitor';

describe('percentile', () => {
  it('uses the nearest rank', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 95)).toBe(95);
  });
});

describe('bucketPerMinute', () => {
  it('returns 30 minutes oldest first, counting only the window', () => {
    const now = Date.parse('2026-11-08T10:30:20Z');
    const buckets = bucketPerMinute(
      [
        new Date('2026-11-08T10:30:05Z'),
        new Date('2026-11-08T10:30:10Z'),
        new Date('2026-11-08T10:01:59Z'),
        new Date('2026-11-08T10:00:59Z'),
      ],
      now,
    );
    expect(buckets).toHaveLength(30);
    expect(buckets[0]).toEqual({ minute: '2026-11-08T10:01:00.000Z', count: 1 });
    expect(buckets[29]).toEqual({ minute: '2026-11-08T10:30:00.000Z', count: 2 });
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });
});
