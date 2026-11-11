import { ProblemPageSchema, TagListSchema } from '@arbiter/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Button, Card, EmptyState, Pagination, QueryState, TableSkeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk } from '@/lib/queryKeys';
import { useClampPage } from '@/lib/useClampPage';
import { useCurrentUser } from '@/stores/auth';
import { ProblemFilters } from './components/ProblemFilters';
import { ProblemTable } from './components/ProblemTable';
import { useUrlFilters } from './hooks/useUrlFilters';
import { PROBLEM_FILTER_DEFAULTS, type ProblemFilterValues } from './lib/filters';

const PAGE_SIZE = 20;

/** /problems: URL-synced filters, paginated table with acceptance and solved markers. */
export function Component() {
  const user = useCurrentUser();
  const filters = useUrlFilters<keyof ProblemFilterValues>(PROBLEM_FILTER_DEFAULTS);
  const { values, page } = filters;

  const params = {
    search: values.search || undefined,
    difficulty: values.difficulty || undefined,
    tag: values.tag || undefined,
    status: user ? values.status || undefined : undefined,
    sort: values.sort,
    page,
    pageSize: PAGE_SIZE,
  };

  const problems = useQuery({
    queryKey: qk.problems.list(params),
    queryFn: ({ signal }) =>
      api.get('/problems', { query: params, schema: ProblemPageSchema, signal }),
    placeholderData: keepPreviousData,
  });

  const { set } = filters;
  useClampPage(problems.data, problems.isPlaceholderData, (last) =>
    set({ page: last }, { replace: true }),
  );

  const tags = useQuery({
    queryKey: qk.tags,
    queryFn: ({ signal }) => api.get('/tags', { schema: TagListSchema, signal }),
    staleTime: 5 * 60_000,
  });

  return (
    <Page
      title="Problems"
      description="Original algorithmic problems. Filter by difficulty and tag, then open one to start solving."
    >
      <ProblemFilters
        values={values}
        tags={tags.data}
        showStatus={user !== null}
        active={filters.active}
        onChange={filters.set}
        onClear={filters.clear}
      />

      <Card className="overflow-hidden">
        <QueryState
          query={problems}
          loading={<TableSkeleton rows={8} columns={5} />}
          isEmpty={(data) => data.items.length === 0 && data.total === 0}
          empty={
            <EmptyState
              icon={<SearchX />}
              title={filters.active ? 'No problems match these filters' : 'No problems yet'}
              description={
                filters.active
                  ? 'Try a different search, or clear a filter to see more problems.'
                  : 'Problems appear here once an admin publishes them.'
              }
              action={
                filters.active ? (
                  <Button variant="secondary" size="sm" onClick={filters.clear}>
                    Reset filters
                  </Button>
                ) : undefined
              }
            />
          }
        >
          {(data) => (
            <div
              className={cn(
                'transition-opacity duration-150',
                problems.isPlaceholderData && 'opacity-60',
              )}
              aria-busy={problems.isPlaceholderData || undefined}
            >
              <ProblemTable
                problems={data.items}
                showStatus={user !== null}
                activeTag={values.tag}
                onTagSelect={(tag) => filters.set({ tag: tag === values.tag ? '' : tag })}
              />
              <div className="border-t border-border px-5 py-3">
                <Pagination
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPageChange={filters.setPage}
                  itemLabel="problems"
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
