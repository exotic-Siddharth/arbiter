/** `?page=` as a positive integer; anything else (1.5, Infinity, text) falls back to page 1. */
export function parsePageParam(raw: string | null): number {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
