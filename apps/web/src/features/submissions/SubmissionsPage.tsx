import { SubmissionPageSchema } from '@arbiter/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { LiveIndicator } from '@/components';
import { Page } from '@/components/layout/Page';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Pagination,
  QueryState,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryKeys';
import { useClampPage } from '@/lib/useClampPage';
import { useSocketStatus } from '@/lib/socket';
import { useCurrentUser } from '@/stores/auth';
import { useUrlFilters } from '@/features/problems/hooks/useUrlFilters';
import { isPendingStatus } from '@/features/problems/lib/progress';
import { SubmissionFilters } from './components/SubmissionFilters';
import { SubmissionsTable } from './components/SubmissionsTable';
import { useLiveSubmissionRows } from './hooks/useLiveSubmissionRows';
import { SUBMISSION_FILTER_DEFAULTS, type SubmissionFilterValues } from './lib/filters';

const PAGE_SIZE = 20;

/** /submissions: filterable list; pending rows update live. */
export function Component() {
  const user = useCurrentUser();
  const socketStatus = useSocketStatus();
  const filters = useUrlFilters<keyof SubmissionFilterValues>(SUBMISSION_FILTER_DEFAULTS);
  const { values, page } = filters;

  const params = {
    mine: user && values.mine === 'true' ? 'true' : undefined,
    problemSlug: values.problem || undefined,
    verdict: values.verdict || undefined,
    language: values.language || undefined,
    username: values.username || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const listKey = qk.submissions.list(params);

  const submissions = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) =>
      api.get('/submissions', { query: params, schema: SubmissionPageSchema, signal }),
    placeholderData: keepPreviousData,
    // Others' pending rows have no room to join: poll while any row is still judging.
    refetchInterval: (q) =>
      q.state.data?.items.some((item) => isPendingStatus(item.status))
        ? socketStatus === 'connected'
          ? 8000
          : 3000
        : false,
  });

  const { set } = filters;
  useClampPage(submissions.data, submissions.isPlaceholderData, (last) =>
    set({ page: last }, { replace: true }),
  );

  const live = useLiveSubmissionRows(listKey, submissions.data?.items);
  const hasPending = submissions.data?.items.some((item) => isPendingStatus(item.status)) ?? false;

  return (
    <Page
      title="Submissions"
      description="Every judged submission, with live updates for the ones still running."
      actions={hasPending && socketStatus === 'connected' ? <LiveIndicator /> : undefined}
    >
      <SubmissionFilters
        values={values}
        signedIn={user !== null}
        active={filters.active}
        onChange={filters.set}
        onClear={filters.clear}
      />

      <Card className="overflow-hidden">
        <QueryState
          query={submissions}
          loading={<TableSkeleton rows={8} columns={6} />}
          isEmpty={(data) => data.items.length === 0 && data.total === 0}
          empty={
            <EmptyState
              icon={<Inbox />}
              title={filters.active ? 'No submissions match these filters' : 'No submissions yet'}
              description={
                filters.active
                  ? 'Try another verdict, language or problem.'
                  : 'Solve a problem and your submission shows up here.'
              }
              action={
                filters.active ? (
                  <Button variant="secondary" size="sm" onClick={filters.clear}>
                    Reset filters
                  </Button>
                ) : (
                  <ButtonLink to="/problems" size="sm">
                    Browse problems
                  </ButtonLink>
                )
              }
            />
          }
        >
          {(data) => (
            <div
              className={cn(
                'transition-opacity duration-150',
                submissions.isPlaceholderData && 'opacity-60',
              )}
              aria-busy={submissions.isPlaceholderData || undefined}
            >
              <SubmissionsTable
                submissions={data.items}
                viewer={user?.username ?? null}
                testsDone={live.testsDone}
                justFinished={live.justFinished}
              />
              <div className="border-t border-border px-5 py-3">
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPageChange={filters.setPage}
                  itemLabel="submissions"
                />
              </div>
            </div>
          )}
        </QueryState>
      </Card>
    </Page>
  );
}

export default Component;
