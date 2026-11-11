import { ContestListSchema, type ContestStatus, type ContestSummary } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import { EmptyState, QueryState, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { ContestListSkeleton } from './components/ContestListSkeleton';
import { ContestCard } from './components/ContestCard';

type Tab = 'running' | 'upcoming' | 'past';

const TABS: { value: Tab; label: string; status: ContestStatus; empty: string }[] = [
  { value: 'running', label: 'Running', status: 'RUNNING', empty: 'No contest is running now' },
  { value: 'upcoming', label: 'Upcoming', status: 'UPCOMING', empty: 'Nothing is scheduled yet' },
  { value: 'past', label: 'Past', status: 'ENDED', empty: 'No contest has finished yet' },
];

const byTime: Record<ContestStatus, (a: ContestSummary, b: ContestSummary) => number> = {
  RUNNING: (a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt),
  UPCOMING: (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  ENDED: (a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt),
};

function isTab(value: string | null): value is Tab {
  return value === 'running' || value === 'upcoming' || value === 'past';
}

/** /contests: tabs Running / Upcoming / Past with countdown cards (spec 13.2). */
export function Component() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const contests = useQuery({
    queryKey: qk.contests.list(),
    queryFn: ({ signal }) => api.get('/contests', { schema: ContestListSchema, signal }),
  });

  const groups = new Map<ContestStatus, ContestSummary[]>();
  for (const t of TABS) {
    groups.set(
      t.status,
      (contests.data ?? []).filter((c) => c.status === t.status).sort(byTime[t.status]),
    );
  }
  const requested = params.get('tab');
  const fallback: Tab = groups.get('RUNNING')?.length
    ? 'running'
    : groups.get('UPCOMING')?.length
      ? 'upcoming'
      : contests.data?.length
        ? 'past'
        : 'running';
  const tab = isTab(requested) ? requested : fallback;
  const onBoundary = () => void queryClient.invalidateQueries({ queryKey: qk.contests.all });

  return (
    <Page
      title="Contests"
      description="ICPC-style rounds: solve the most problems with the least penalty before the clock runs out."
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set('tab', value);
          setParams(next, { replace: true });
        }}
      >
        <TabsList aria-label="Contests by status">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              count={contests.data ? groups.get(t.status)?.length : undefined}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-5">
            <QueryState
              query={contests}
              loading={<ContestListSkeleton />}
              isEmpty={() => (groups.get(t.status)?.length ?? 0) === 0}
              empty={
                <EmptyState
                  icon={<CalendarX2 />}
                  title={t.empty}
                  description={
                    t.value === 'past'
                      ? 'Finished rounds and their final scoreboards will appear here.'
                      : 'Check the other tabs, or come back later.'
                  }
                />
              }
            >
              {() => (
                <ul className="space-y-3">
                  {(groups.get(t.status) ?? []).map((contest) => (
                    <li key={contest.slug}>
                      <ContestCard
                        contest={contest}
                        now={contests.dataUpdatedAt}
                        onBoundary={onBoundary}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  );
}

export default Component;
