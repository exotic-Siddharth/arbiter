import { JudgeStatusSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { Page } from '@/components/layout/Page';
import { QueryState } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { JudgeDashboard, MonitorSkeleton, REFRESH_MS } from './components/JudgeDashboard';

/** /admin: queues, workers, latency and throughput, refreshed every 5 s (spec 13.2). */
export function Component() {
  const status = useQuery({
    queryKey: qk.admin.judge,
    queryFn: ({ signal }) => api.get('/admin/judge', { schema: JudgeStatusSchema, signal }),
    refetchInterval: REFRESH_MS,
    staleTime: 0,
  });

  return (
    <Page
      title="Judge monitor"
      documentTitle="Admin · Judge monitor"
      description="Queue depth, workers and verdict latency, refreshed every 5 seconds."
    >
      <QueryState query={status} loading={<MonitorSkeleton />}>
        {(data) => <JudgeDashboard data={data} updatedAt={status.dataUpdatedAt} />}
      </QueryState>
    </Page>
  );
}

export default Component;
