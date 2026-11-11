import type { ScoreCell as ScoreCellData } from '@arbiter/shared';
import { cn } from '@/lib/cn';
import {
  MINUS,
  STAR,
  describeScoreCell,
  formatAcMinute,
  scoreCellState,
  type ScoreCellState,
} from '../lib/scoreCell';

const STATE_STYLES: Record<ScoreCellState, string> = {
  empty: 'border-transparent text-muted',
  solved: 'border-verdict-ac/25 bg-verdict-ac/12 text-verdict-ac',
  failed: 'border-verdict-wa/25 bg-verdict-wa/10 text-verdict-wa',
  pending: 'border-warning/35 bg-warning/12 text-warning',
};

/** First solve: a darker green than the solved tint, white text (AA in both themes). */
const FIRST_SOLVE_STYLE =
  'border-transparent bg-[color-mix(in_oklab,var(--color-verdict-ac)_62%,black)] text-white';

export interface ScoreCellProps {
  /** undefined = no data for this problem (never attempted). */
  cell: ScoreCellData | undefined;
  className?: string;
}

/**
 * One ICPC scoreboard cell (spec 13.2): green "+" / "+2" with the AC minute, red "−3", yellow
 * pending "?", and a darker green "★" for the first solve of the problem. The glyphs are
 * hidden from screen readers, which hear describeScoreCell() instead.
 */
export function ScoreCell({ cell, className }: ScoreCellProps) {
  const state = scoreCellState(cell);
  const description = describeScoreCell(cell);
  const firstSolve = state === 'solved' && cell?.firstSolve === true;

  let top: string | null = null;
  let bottom: string | null = null;
  if (cell && state === 'solved') {
    top = cell.attempts > 0 ? `+${cell.attempts}` : '+';
    bottom = cell.acMinute === null ? null : formatAcMinute(cell.acMinute);
  } else if (cell && state === 'failed') {
    top = `${MINUS}${cell.attempts}`;
  } else if (cell && state === 'pending') {
    top = '?';
    bottom = cell.attempts > 0 ? `${MINUS}${cell.attempts}` : null;
  }

  return (
    <div
      data-state={state}
      data-first-solve={firstSolve ? 'true' : undefined}
      title={state === 'empty' ? undefined : description}
      className={cn(
        'relative mx-auto flex h-10 w-[3.25rem] flex-col items-center justify-center rounded-md border font-mono leading-none tabular-nums',
        firstSolve ? FIRST_SOLVE_STYLE : STATE_STYLES[state],
        className,
      )}
    >
      {top !== null ? (
        <span aria-hidden="true" className="flex items-center gap-0.5 text-[13px] font-semibold">
          {firstSolve ? <span className="text-[10px]">{STAR}</span> : null}
          <span>{top}</span>
        </span>
      ) : null}
      {bottom !== null ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-1 text-[10.5px] font-medium',
            firstSolve ? 'text-white/85' : 'opacity-80',
          )}
        >
          {bottom}
        </span>
      ) : null}
      {state === 'pending' ? (
        <span aria-hidden="true" className="absolute right-1 top-1 flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      <span className="sr-only">{description}</span>
    </div>
  );
}
