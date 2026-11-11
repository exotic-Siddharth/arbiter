import { Radio } from 'lucide-react';
import { Link } from 'react-router';
import { LiveIndicator } from '@/components/LiveIndicator';
import { TimeAgo } from '@/components/TimeAgo';
import { UserLink } from '@/components/UserLink';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatMs, languageLabel } from '@/lib/format';
import { useLiveFeed, type FeedItem } from '../hooks/useLiveFeed';

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <li className="flex animate-enter-top items-center gap-3 px-4 py-2.5 sm:px-5">
      <VerdictBadge
        verdict={item.verdict}
        variant="short"
        size="sm"
        className="w-12 justify-center"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <UserLink username={item.username} className="max-w-[10rem] align-bottom" />
          <span className="text-muted"> on </span>
          <Link
            to={'/problems/' + encodeURIComponent(item.problemSlug)}
            className="rounded-sm font-medium text-foreground hover:underline hover:underline-offset-2"
          >
            {item.problemTitle}
          </Link>
        </p>
        <p className="truncate text-xs text-muted">
          {languageLabel(item.language)}
          {item.timeMs !== null ? (
            <span className="font-mono tabular-nums"> · {formatMs(item.timeMs)}</span>
          ) : null}
        </p>
      </div>
      <TimeAgo date={item.at} className="shrink-0 text-xs text-muted" />
    </li>
  );
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="h-5 w-12" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Live feed of judged submissions (newest first), fed by the REST list and `feed:judged`. */
export function LiveFeed() {
  const { items, seed } = useLiveFeed();
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader
        title="Judged just now"
        description="Verdicts from the sandbox as they land."
        actions={<LiveIndicator />}
        divider
        className="px-4 pt-4 sm:px-5"
      />
      <div className="flex-1">
        {items.length > 0 ? (
          <ul aria-label="Recently judged submissions" className="divide-y divide-border">
            {items.map((item) => (
              <FeedRow key={item.key} item={item} />
            ))}
          </ul>
        ) : seed.isPending ? (
          <div role="status" aria-label="Loading recent submissions" aria-busy="true">
            <FeedSkeleton />
          </div>
        ) : seed.isError ? (
          <ErrorState
            compact
            error={seed.error}
            title="Could not load recent submissions"
            retrying={seed.isFetching}
            onRetry={() => void seed.refetch()}
          />
        ) : (
          <EmptyState
            compact
            icon={<Radio />}
            title="Waiting for the next submission"
            description="Judged submissions appear here the moment their verdict is ready."
          />
        )}
      </div>
    </Card>
  );
}
