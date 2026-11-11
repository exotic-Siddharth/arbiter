/**
 * Deterministic randomness for the seed (spec section 14): the same seed always builds the same
 * database, so screenshots, e2e tests and bug reports are reproducible.
 */
export type Rng = () => number;

/** mulberry32: a small, well-distributed 32-bit PRNG returning floats in [0, 1). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a label into a seed, so independent parts of the seed get independent streams. */
export function seedOf(label: string): number {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i += 1) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Integer in [min, max] (both inclusive). */
export const int = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/** Float in [min, max). */
export const range = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

export const chance = (rng: Rng, probability: number): boolean => rng() < probability;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates shuffle into a new array. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A cuid-shaped id (25 chars, leading "c") drawn from the rng, so the seed can link rows before inserting. */
export function cuidLike(rng: Rng): string {
  let id = 'c';
  for (let i = 0; i < 24; i += 1) id += BASE36[Math.floor(rng() * 36)];
  return id;
}
