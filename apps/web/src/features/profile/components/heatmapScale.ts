/** 0 for an empty day, otherwise 1 to 4 relative to the busiest day of the year. */
export function levelFor(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((4 * count) / max))) as 1 | 2 | 3 | 4;
}
