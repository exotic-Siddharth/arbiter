import { LIMITS } from '@arbiter/shared';

/**
 * `?page=` as an integer from 1 to LIMITS.pageMax, the highest page the API accepts. Larger
 * integers (1000001, 1e300) are clamped to it, so the API answers with an empty page and a total
 * and useClampPage moves to the real last page; anything else (1.5, Infinity, 0, -3, text) falls
 * back to page 1.
 */
export function parsePageParam(raw: string | null): number {
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, LIMITS.pageMax);
}
