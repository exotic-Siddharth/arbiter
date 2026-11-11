import type { ScoreCell } from '@arbiter/shared';
import { pluralize } from '@/lib/format';

/** U+2212 MINUS SIGN: "−3" reads better than a hyphen in a numeric cell. */
export const MINUS = String.fromCharCode(0x2212);
export const STAR = String.fromCharCode(0x2605);

/** Minutes since the start as h:mm: 17 -> "0:17", 105 -> "1:45", 8640 -> "144:00". */
export function formatAcMinute(minute: number): string {
  return `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;
}

export type ScoreCellState = 'empty' | 'solved' | 'failed' | 'pending';

/** Display state; a solved cell stays solved (submissions after the first AC are ignored). */
export function scoreCellState(cell: ScoreCell | undefined): ScoreCellState {
  if (!cell) return 'empty';
  if (cell.solved) return 'solved';
  if (cell.pending) return 'pending';
  return cell.attempts > 0 ? 'failed' : 'empty';
}

/** Spoken/tooltip form of a cell, e.g. "Solved at 1:45 after 2 rejected attempts". */
export function describeScoreCell(cell: ScoreCell | undefined): string {
  const state = scoreCellState(cell);
  if (!cell || state === 'empty') return 'Not attempted';
  const rejected = pluralize(cell.attempts, 'rejected attempt');
  if (state === 'solved') {
    const at = cell.acMinute === null ? 'Solved' : `Solved at ${formatAcMinute(cell.acMinute)}`;
    const tries = cell.attempts === 0 ? ' on the first try' : ` after ${rejected}`;
    return `${at}${tries}${cell.firstSolve ? ', first to solve' : ''}`;
  }
  if (state === 'pending') {
    return cell.attempts > 0
      ? `${rejected}, a submission is being judged`
      : 'A submission is being judged';
  }
  return rejected;
}
