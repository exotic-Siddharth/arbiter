import { LeaderboardPageSchema } from '@arbiter/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { QueryState } from '@/components/ui/QueryState';
import { TableSkeleton } from '@/components/ui/Table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useClampPage } from '@/lib/useClampPage';
import { useCurrentUser } from '@/stores/auth';
import { LeaderboardTable } from './components/LeaderboardTable';

const PAGE_SIZE = 25;
type Ordering = 'rating' | 'solved';

const DESCRIPTIONS: Record<Ordering, string> = {
  rating: 'Players ranked by contest rating. Equal ratings share a rank.',
  solved: 'Players ranked by the number of distinct problems they have solved.',
};

export function Component() {
  const [params, setParams] = useSearchParams();
  const by: Ordering = params.get('by') === 'solved' ? 'solved' : 'rating';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const user = useCurrentUser();

  const query = useQuery({
    queryKey: qk.leaderboard({ by, page, pageSize: PAGE_SIZE }),
    queryFn: ({ signal }) =>
      api.get('/leaderboard', {
        query: { by, page, pageSize: PAGE_SIZE },
        schema: LeaderboardPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  useClampPage(query.data, query.isPlaceholderData, (last) =>
    update({ page: last === 1 ? null : String(last) }),
  );

  return (
    <Page title="Leaderboard" description={DESCRIPTIONS[by]}>
      <Tabs
        value={by}
        variant="pills"
        onValueChange={(value) => update({ by: value === 'solved' ? 'solved' : null, page: null })}
        className="space-y-4"
      >
        <TabsList aria-label="Ranking">
          <TabsTrigger value="rating">By rating</TabsTrigger>
          <TabsTrigger value="solved">By solved</TabsTrigger>
        </TabsList>
        <TabsContent value={by}>
          <Card className="overflow-hidden">
            <QueryState
              query={query}
              loading={<TableSkeleton rows={10} columns={4} />}
              isEmpty={(data) => data.items.length === 0 && data.total === 0}
              empty={
                <EmptyState
                  icon={<Trophy />}
                  title="No ranked players yet"
                  description="Solve a problem or take part in a contest to appear here."
                />
              }
            >
              {(data) => (
                <div
                  className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
                >
                  <LeaderboardTable entries={data.items} currentUser={user?.username} by={by} />
                  <div className="border-t border-border px-5 py-3">
                    <Pagination
                      page={data.page}
                      pageSize={data.pageSize}
                      total={data.total}
                      itemLabel="players"
                      onPageChange={(next) => update({ page: next === 1 ? null : String(next) })}
                    />
                  </div>
                </div>
              )}
            </QueryState>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default Component;
