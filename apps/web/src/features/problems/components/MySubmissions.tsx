import { SubmissionPageSchema, type SubmissionSummary } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { TimeAgo, VerdictBadge } from '@/components';
import { Badge, EmptyState, QueryState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatMemoryKb, formatMs, languageLabel } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { isPendingStatus } from '../lib/progress';

function mySubmissionsParams(problemSlug: string) {
  return { problemSlug, mine: 'true', page: 1, pageSize: 20 } as const;
}

export interface MySubmissionsProps {
  problemSlug: string;
  /** The submission shown in the Result panel. */
  activeId: string | null;
  /** Opens a submission in the Result panel. */
  onSelect: (submission: SubmissionSummary) => void;
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** "My submissions" tab of the workspace: the signed-in user's attempts at this problem. */
export function MySubmissions({ problemSlug, activeId, onSelect }: MySubmissionsProps) {
  const params = mySubmissionsParams(problemSlug);
  const query = useQuery({
    queryKey: qk.submissions.list(params),
    queryFn: ({ signal }) =>
      api.get('/submissions', { query: params, schema: SubmissionPageSchema, signal }),
    refetchInterval: (q) =>
      q.state.data?.items.some((item) => isPendingStatus(item.status)) ? 4000 : false,
  });

  return (
    <QueryState
      query={query}
      compact
      loading={<LoadingRows />}
      isEmpty={(data) => data.items.length === 0}
      empty={
        <EmptyState
          compact
          icon={<Inbox />}
          title="No submissions yet"
          description="Submit a solution and it shows up here with its verdict."
        />
      }
    >
      {(data) => (
        <ul className="space-y-1.5" aria-label="My submissions">
          {data.items.map((submission) => (
            <li key={submission.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-control border px-2 py-1.5 transition-colors',
                  submission.id === activeId
                    ? 'border-primary/50 bg-primary-soft'
                    : 'border-border hover:bg-raised/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(submission)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-1 py-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Show submission from ${new Date(submission.createdAt).toLocaleString()} in the result panel`}
                >
                  <VerdictBadge
                    verdict={submission.verdict}
                    status={submission.status}
                    testsDone={submission.testsPassed}
                    testsTotal={submission.testsTotal}
                    size="sm"
                  />
                  <span className="text-[13px] text-foreground">
                    {languageLabel(submission.language)}
                  </span>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {formatMs(submission.timeMs)} · {formatMemoryKb(submission.memoryKb)}
                  </span>
                  {submission.contestSlug ? (
                    <Badge size="sm" tone="primary">
                      contest
                    </Badge>
                  ) : null}
                  <TimeAgo date={submission.createdAt} className="ml-auto text-xs text-muted" />
                </button>
                <Link
                  to={`/submissions/${submission.id}`}
                  aria-label="Open submission details"
                  title="Open submission details"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
