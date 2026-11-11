import { ScoreboardSchema } from '@arbiter/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer } from 'react';
import { LiveIndicator, TimeAgo } from '@/components';
import { Card, EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryKeys';
import { useRoom, useSocketEvent } from '@/lib/socket';
import { useCurrentUser } from '@/stores/auth';
import { MINUS, STAR } from '../lib/scoreCell';
import { initialScoreboardState, scoreboardReducer } from '../scoreboardReducer';
import { ScoreboardTable } from './ScoreboardTable';

/** How long a moved row keeps its arrow and highlight. */
const SETTLE_MS = 3000;
/** Debounce before refetching a page an event could not be applied to exactly. */
const STALE_REFETCH_MS = 800;

export interface LiveScoreboardProps {
  slug: string;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Classes of the table's scroll container (e.g. max-h for the sticky header). */
  tableClassName?: string;
  /** No contest submissions are possible yet (before the start). */
  notStarted?: boolean;
}

function Legend() {
  const item = (swatch: string, glyph: string, text: string) => (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-5 min-w-6 items-center justify-center rounded px-1 font-mono text-[11px] font-semibold',
          swatch,
        )}
      >
        {glyph}
      </span>
      {text}
    </li>
  );
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {item('bg-verdict-ac/12 text-verdict-ac', '+2', 'solved, 2 rejected tries')}
      {item(
        'bg-[color-mix(in_oklab,var(--color-verdict-ac)_62%,black)] text-white',
        STAR,
        'first solve',
      )}
      {item('bg-verdict-wa/10 text-verdict-wa', `${MINUS}3`, 'unsolved, 3 tries')}
      {item('bg-warning/12 text-warning', '?', 'judging')}
    </ul>
  );
}

/**
 * The live ICPC scoreboard (R3, R6): REST pages are the source of truth; `scoreboard:row`
 * events (one row each) are merged in and re-ranked locally, and the room's reconnect
 * invalidation refetches the page after any gap.
 */
export function LiveScoreboard({
  slug,
  page,
  pageSize = 50,
  onPageChange,
  tableClassName,
  notStarted = false,
}: LiveScoreboardProps) {
  const user = useCurrentUser();
  const params = { page, pageSize };
  const query = useQuery({
    queryKey: qk.contests.scoreboard(slug, params),
    queryFn: ({ signal }) =>
      api.get(`/contests/${encodeURIComponent(slug)}/scoreboard`, {
        query: params,
        schema: ScoreboardSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  const { refetch } = query;

  useRoom('contest:subscribe', { slug }, { invalidate: [qk.contests.scoreboard(slug)] });

  const [state, dispatch] = useReducer(scoreboardReducer, initialScoreboardState);

  // Each REST snapshot replaces the rows (before paint, so there is no empty flash).
  useLayoutEffect(() => {
    if (query.data) dispatch({ type: 'snapshot', board: query.data, at: query.dataUpdatedAt });
  }, [query.data, query.dataUpdatedAt]);

  useSocketEvent('scoreboard:row', (event) => {
    dispatch({ type: 'row', contestSlug: event.contestSlug, row: event.row, at: Date.now() });
  });

  // An event changed who belongs on this page: fetch the page again.
  useEffect(() => {
    if (!state.stale) return;
    const timer = setTimeout(() => void refetch(), STALE_REFETCH_MS);
    return () => clearTimeout(timer);
  }, [state.stale, refetch]);

  // Clear arrows and highlights a few seconds after the latest move.
  const latestMove = state.rows.reduce((max, row) => Math.max(max, row.movedAt ?? 0), 0);
  useEffect(() => {
    if (!latestMove) return;
    const timer = setTimeout(() => dispatch({ type: 'settle', before: latestMove }), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [latestMove]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <LiveIndicator />
        {state.updatedAt ? (
          <span>
            Updated <TimeAgo date={state.updatedAt} />
          </span>
        ) : null}
      </div>
      <Legend />
    </div>
  );

  if (query.isPending) {
    return (
      <Card className="overflow-hidden">
        {header}
        <div role="status" aria-label="Loading the scoreboard" aria-busy="true">
          <TableSkeleton rows={8} columns={7} />
        </div>
      </Card>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Card className="overflow-hidden">
        {header}
        <ErrorState
          error={query.error}
          title="The scoreboard could not be loaded"
          retrying={query.isFetching}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const rows = state.source ? state.rows : [];
  return (
    <Card className="overflow-hidden">
      {header}
      {rows.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title={notStarted ? 'The scoreboard opens at the start' : 'No submissions yet'}
          description={
            notStarted
              ? 'Registered participants appear here after their first submission.'
              : 'Participants appear here after their first contest submission.'
          }
        />
      ) : (
        <ScoreboardTable
          problems={state.problems}
          rows={rows}
          currentUsername={user?.username}
          containerClassName={tableClassName}
        />
      )}
      {state.total > state.pageSize ? (
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={state.page}
            pageSize={state.pageSize}
            total={state.total}
            onPageChange={onPageChange}
            itemLabel="participants"
          />
        </div>
      ) : null}
    </Card>
  );
}
