import type { LeaderboardEntry } from '@arbiter/shared';
import type { CSSProperties } from 'react';
import { RatingBadge } from '@/components/RatingBadge';
import { UserLink } from '@/components/UserLink';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/** Podium colours for ranks 1 to 3 (any other rank is plain text). */
const PODIUM: Record<number, string> = {
  1: 'var(--color-tier-amber)',
  2: 'var(--color-tier-gray)',
  3: 'var(--color-verdict-mle)',
};

export interface LeaderboardTableProps {
  entries: readonly LeaderboardEntry[];
  /** The signed-in user's name: their row is highlighted. */
  currentUser?: string;
  /** Which column the ranking is sorted by. */
  by: 'rating' | 'solved';
}

/** Whether this row shares its rank with a neighbour on the page. */
function isTied(entries: readonly LeaderboardEntry[], index: number): boolean {
  const rank = entries[index]?.rank;
  return entries[index - 1]?.rank === rank || entries[index + 1]?.rank === rank;
}

function RankCell({ rank, tied }: { rank: number; tied: boolean }) {
  const podium = PODIUM[rank];
  return (
    <span
      role="img"
      aria-label={tied ? `Rank ${rank}, tied` : `Rank ${rank}`}
      style={podium ? ({ '--rank-color': podium } as CSSProperties) : undefined}
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center gap-px rounded-full px-1.5 font-mono text-[13px] font-semibold tabular-nums',
        podium
          ? 'border border-(--rank-color)/40 bg-(--rank-color)/15 text-foreground'
          : 'text-muted',
      )}
    >
      <span aria-hidden="true">{formatNumber(rank)}</span>
      {tied ? (
        <span aria-hidden="true" className="text-muted">
          =
        </span>
      ) : null}
    </span>
  );
}

/** Ranked table; ties (equal rank) are shown with the shared number and an "=" marker. */
export function LeaderboardTable({ entries, currentUser, by }: LeaderboardTableProps) {
  return (
    <Table className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_td:first-child]:pl-3 max-sm:[&_th:first-child]:pl-3 max-sm:[&_td:last-child]:pr-3 max-sm:[&_th:last-child]:pr-3">
      <THead>
        <Tr>
          <Th className="w-14 sm:w-20">Rank</Th>
          <Th>User</Th>
          <Th numeric className={cn(by === 'rating' && 'text-foreground')}>
            Rating
          </Th>
          <Th numeric className={cn(by === 'solved' && 'text-foreground')}>
            Solved
          </Th>
        </Tr>
      </THead>
      <TBody>
        {entries.map((entry, index) => {
          const isYou =
            currentUser !== undefined && entry.username.toLowerCase() === currentUser.toLowerCase();
          return (
            <Tr key={entry.username} interactive selected={isYou}>
              <Td>
                <RankCell rank={entry.rank} tied={isTied(entries, index)} />
              </Td>
              <Td className="w-full max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <UserLink username={entry.username} rating={entry.rating} showAvatar />
                  {isYou ? (
                    <Badge size="sm" tone="primary">
                      You
                    </Badge>
                  ) : null}
                </span>
              </Td>
              <Td numeric>
                <RatingBadge rating={entry.rating} variant="text" showTier={false} />
              </Td>
              <Td numeric className={cn(by === 'solved' && 'font-semibold text-foreground')}>
                {formatNumber(entry.solved)}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
