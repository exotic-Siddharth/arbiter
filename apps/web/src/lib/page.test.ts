import { LIMITS } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import { parsePageParam } from './page';

describe('parsePageParam (A-R2-17)', () => {
  it.each([
    [null, 1],
    ['', 1],
    ['abc', 1],
    ['1.5', 1],
    ['0', 1],
    ['-3', 1],
    ['Infinity', 1],
    ['1', 1],
    ['7', 7],
    [String(LIMITS.pageMax), LIMITS.pageMax],
  ])('?page=%s -> %i', (raw, page) => {
    expect(parsePageParam(raw)).toBe(page);
  });

  it.each([String(LIMITS.pageMax + 1), '5000000', '99999999999999999999', '1e300'])(
    'clamps ?page=%s to the highest page the API accepts',
    (raw) => {
      expect(parsePageParam(raw)).toBe(LIMITS.pageMax);
    },
  );
});
