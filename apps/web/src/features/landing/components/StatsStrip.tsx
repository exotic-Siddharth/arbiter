import { StatsSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { Activity, Code2, Swords, Users, Zap } from 'lucide-react';
import { ErrorState } from '@/components/ui/EmptyState';
import { Stat } from '@/components/ui/Stat';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

/** Platform figures from GET /api/stats (refreshed every minute). */
export function StatsStrip() {
  const query = useQuery({
    queryKey: qk.stats,
    queryFn: ({ signal }) => api.get('/stats', { schema: StatsSchema, signal }),
    refetchInterval: 60_000,
  });

  if (query.isError && !query.data) {
    return (
      <ErrorState
        compact
        error={query.error}
        title="Platform stats are unavailable"
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const stats = query.data;
  const loading = query.isPending;
  return (
    <section
      aria-label="Platform statistics"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Stat
        label="Problems"
        icon={<Code2 />}
        value={stats ? formatNumber(stats.problems) : ''}
        loading={loading}
      />
      <Stat
        label="Players"
        icon={<Users />}
        value={stats ? formatNumber(stats.users) : ''}
        loading={loading}
      />
      <Stat
        label="Submissions"
        icon={<Activity />}
        value={stats ? formatNumber(stats.submissions) : ''}
        loading={loading}
      />
      <Stat
        label="Judged today"
        icon={<Zap />}
        value={stats ? formatNumber(stats.judgedToday) : ''}
        loading={loading}
      />
      <Stat
        label="Live contests"
        icon={<Swords />}
        value={stats ? formatNumber(stats.runningContests) : ''}
        loading={loading}
        className="col-span-2 sm:col-span-1"
      />
    </section>
  );
}
