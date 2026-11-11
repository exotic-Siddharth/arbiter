import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { UserLink } from '@/components';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { LiveScoreRow } from '../scoreboardReducer';
import { ScoreCell } from './ScoreCell';

export interface ScoreboardTableProps {
  problems: { label: string }[];
  rows: LiveScoreRow[];
  /** Signed-in user's row is tinted. */
  currentUsername?: string | null;
  /** Classes of the scroll container (e.g. a max height so the header can stick). */
  containerClassName?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Rows slide from their old position to the new one (FLIP) when ranks change, unless the user
 * prefers reduced motion; moved rows also flash once and show an up/down arrow.
 */
function useRowFlip(rows: LiveScoreRow[]) {
  const elements = useRef(new Map<string, HTMLTableRowElement>());
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    const next = new Map<string, number>();
    for (const [username, el] of elements.current) {
      const top = el.offsetTop;
      next.set(username, top);
      const previous = tops.current.get(username);
      if (
        !reduced &&
        previous !== undefined &&
        previous !== top &&
        typeof el.animate === 'function'
      ) {
        el.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'none' }], {
          duration: 450,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        });
      }
    }
    tops.current = next;
  }, [rows]);

  return (username: string) => (el: HTMLTableRowElement | null) => {
    if (el) elements.current.set(username, el);
    else elements.current.delete(username);
  };
}

const stickyCell = 'sticky z-10 bg-surface';

/**
 * ICPC standings: rank, user (tier colour), solved, penalty and one ScoreCell per problem.
 * The header and the rank/user columns stick while the table scrolls (phones scroll sideways).
 */
export function ScoreboardTable({
  problems,
  rows,
  currentUsername,
  containerClassName,
}: ScoreboardTableProps) {
  const rowRef = useRowFlip(rows);
  const me = currentUsername?.toLowerCase();
  const latestMove = rows
    .filter((r) => r.movement === 'up' && r.movedAt !== null)
    .sort((a, b) => (b.movedAt ?? 0) - (a.movedAt ?? 0))[0];

  return (
    <div
      className={cn(
        'relative w-full overflow-auto overscroll-x-contain scrollbar-thin',
        containerClassName,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <caption className="sr-only">Scoreboard</caption>
        <thead>
          <tr className="text-xs font-medium text-muted">
            <th
              scope="col"
              className={cn(
                stickyCell,
                'left-0 top-0 z-30 w-12 min-w-12 border-b border-border px-3 py-2.5 text-right',
              )}
            >
              #
            </th>
            <th
              scope="col"
              className={cn(
                stickyCell,
                'left-12 top-0 z-30 min-w-36 border-b border-r border-border px-3 py-2.5 text-left sm:min-w-48 sm:border-r-0',
              )}
            >
              User
            </th>
            <th
              scope="col"
              className="sticky top-0 z-20 w-16 border-b border-border bg-surface px-3 py-2.5 text-right"
            >
              Solved
            </th>
            <th
              scope="col"
              className="sticky top-0 z-20 w-20 border-b border-border bg-surface px-3 py-2.5 text-right"
            >
              Penalty
            </th>
            {problems.map((p) => (
              <th
                key={p.label}
                scope="col"
                className="sticky top-0 z-20 w-16 min-w-16 border-b border-border bg-surface px-1.5 py-2.5 text-center font-mono text-[13px] font-semibold text-foreground"
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mine = me !== undefined && row.username.toLowerCase() === me;
            const cells = new Map(row.cells.map((c) => [c.label, c]));
            return (
              <tr
                key={row.username}
                ref={rowRef(row.username)}
                data-movement={row.movement ?? undefined}
                className={cn(
                  'group',
                  row.movement !== null && 'animate-highlight',
                  mine && '[&>td]:bg-primary-soft',
                )}
              >
                <td
                  className={cn(
                    stickyCell,
                    'left-0 border-b border-border px-3 py-1.5 text-right font-mono font-semibold text-foreground',
                  )}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {row.movement === 'up' ? (
                      <ArrowUp aria-hidden="true" className="size-3 text-success" />
                    ) : row.movement === 'down' ? (
                      <ArrowDown aria-hidden="true" className="size-3 text-danger" />
                    ) : null}
                    {row.rank}
                  </span>
                  {row.movement === 'up' || row.movement === 'down' ? (
                    <span className="sr-only">
                      {row.movement === 'up' ? ', up from ' : ', down from '}
                      {row.previousRank}
                    </span>
                  ) : null}
                </td>
                <td
                  className={cn(
                    stickyCell,
                    'left-12 max-w-48 border-b border-r border-border px-3 py-1.5 sm:max-w-64 sm:border-r-0',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <UserLink username={row.username} rating={row.rating} className="min-w-0" />
                    {mine ? <span className="shrink-0 text-[11px] text-muted">(you)</span> : null}
                  </div>
                </td>
                <td className="border-b border-border px-3 py-1.5 text-right font-mono font-semibold text-foreground">
                  {row.solved}
                </td>
                <td className="border-b border-border px-3 py-1.5 text-right font-mono text-muted">
                  {formatNumber(row.penalty)}
                </td>
                {problems.map((p) => (
                  <td key={p.label} className="border-b border-border px-1.5 py-1.5">
                    <ScoreCell cell={cells.get(p.label)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sr-only" aria-live="polite">
        {latestMove ? `${latestMove.username} moved up to rank ${latestMove.rank}` : ''}
      </p>
    </div>
  );
}
