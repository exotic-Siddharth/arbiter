import { isApiError } from '@/lib/api';

/**
 * True when a 409 is a duplicate slug. The API maps the unique-constraint error to a generic
 * message with `details.target` naming the columns (['slug']); other 409s (publishing without
 * tests, rated-contest locks) are reported with their own message.
 */
export function isSlugConflict(error: unknown): boolean {
  if (!isApiError(error) || error.status !== 409) return false;
  const details = error.details as { target?: unknown } | null | undefined;
  const target = details?.target;
  if (Array.isArray(target)) return target.includes('slug');
  if (typeof target === 'string') return /slug/i.test(target);
  return /slug/i.test(error.message);
}
