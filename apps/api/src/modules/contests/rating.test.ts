import { describe, expect, it } from 'vitest';
import { computeRatingDeltas, type RatingParticipant } from './rating';

const sum = (deltas: Map<string, number>) => [...deltas.values()].reduce((a, b) => a + b, 0);

describe('computeRatingDeltas', () => {
  it('is zero-sum within N on a mixed field', () => {
    const participants: RatingParticipant[] = [
      { userId: 'a', rating: 1850, rank: 1 },
      { userId: 'b', rating: 1200, rank: 2 },
      { userId: 'c', rating: 1500, rank: 2 },
      { userId: 'd', rating: 1320, rank: 4 },
      { userId: 'e', rating: 2100, rank: 5 },
      { userId: 'f', rating: 1000, rank: 6 },
      { userId: 'g', rating: 1410, rank: 7 },
    ];
    const deltas = computeRatingDeltas(participants);
    expect(deltas.size).toBe(participants.length);
    expect(Math.abs(sum(deltas))).toBeLessThanOrEqual(participants.length);
  });

  it('stays zero-sum within N for many pseudo-random fields', () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 50; round += 1) {
      const n = 2 + Math.floor(next() * 30);
      const participants = Array.from({ length: n }, (_, i) => ({
        userId: `u${i}`,
        rating: 800 + Math.floor(next() * 1800),
        rank: 1 + Math.floor(next() * n),
      }));
      expect(Math.abs(sum(computeRatingDeltas(participants)))).toBeLessThanOrEqual(n);
    }
  });

  it('the winner gains and the last place loses', () => {
    const deltas = computeRatingDeltas([
      { userId: 'w', rating: 1200, rank: 1 },
      { userId: 'm', rating: 1200, rank: 2 },
      { userId: 'l', rating: 1200, rank: 3 },
    ]);
    expect(deltas.get('w')).toBeGreaterThan(0);
    expect(deltas.get('l')).toBeLessThan(0);
    expect(deltas.get('m')).toBe(0);
    // 64 * (1 - 0.5 + 1 - 0.5) / 2 = 32
    expect(deltas.get('w')).toBe(32);
  });

  it('a strong favourite who wins gains less than an underdog who wins', () => {
    const favourite = computeRatingDeltas([
      { userId: 'f', rating: 2000, rank: 1 },
      { userId: 'x', rating: 1200, rank: 2 },
    ]);
    const underdog = computeRatingDeltas([
      { userId: 'x', rating: 1200, rank: 1 },
      { userId: 'f', rating: 2000, rank: 2 },
    ]);
    expect(favourite.get('f')).toBeGreaterThan(0);
    expect(underdog.get('x')).toBeGreaterThan(favourite.get('f')!);
  });

  it('equal ratings with a tie give 0', () => {
    const deltas = computeRatingDeltas([
      { userId: 'a', rating: 1500, rank: 1 },
      { userId: 'b', rating: 1500, rank: 1 },
    ]);
    expect(deltas.get('a')).toBe(0);
    expect(deltas.get('b')).toBe(0);
  });

  it('gives 0 to a lone participant and an empty map for nobody', () => {
    expect(computeRatingDeltas([{ userId: 'solo', rating: 1300, rank: 1 }])).toEqual(
      new Map([['solo', 0]]),
    );
    expect(computeRatingDeltas([]).size).toBe(0);
  });
});
