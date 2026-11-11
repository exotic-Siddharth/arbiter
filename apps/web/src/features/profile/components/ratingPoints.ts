import type { Profile } from '@arbiter/shared';

export type RatingHistoryEntry = Profile['ratingHistory'][number];

export interface Point {
  /** 0 is the starting rating, 1..n are the rated contests in order. */
  step: number;
  rating: number;
  title: string;
  date: string | null;
  rank: number | null;
  delta: number | null;
}

export function toPoints(history: readonly RatingHistoryEntry[]): Point[] {
  const first = history[0];
  if (!first) return [];
  return [
    {
      step: 0,
      rating: first.oldRating,
      title: 'Starting rating',
      date: null,
      rank: null,
      delta: null,
    },
    ...history.map((entry, index) => ({
      step: index + 1,
      rating: entry.newRating,
      title: entry.contestTitle,
      date: entry.date,
      rank: entry.rank,
      delta: entry.newRating - entry.oldRating,
    })),
  ];
}

/** Y range padded to whole hundreds, at least 200 tall so a flat history still shows a band. */
export function ratingDomain(points: readonly Point[]): [number, number] {
  const ratings = points.map((point) => point.rating);
  let low = Math.floor((Math.min(...ratings) - 60) / 100) * 100;
  let high = Math.ceil((Math.max(...ratings) + 60) / 100) * 100;
  if (high - low < 200) {
    low -= 100;
    high += 100;
  }
  return [low, high];
}
