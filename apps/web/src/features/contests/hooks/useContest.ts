import { ContestDetailSchema, type ContestDetail } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { computeServerOffset } from '@/lib/time';
import { contestBoundary, contestPhase } from '../lib/contestClock';

function offsetOf(data: ContestDetail | undefined, receivedAt: number): number {
  return data ? computeServerOffset(data.serverTime, receivedAt) : 0;
}

/**
 * GET /api/contests/:slug plus the server clock (Review Focus 3): `offsetMs` corrects the
 * client clock with the response's serverTime, and `boundary` is the phase at server time.
 * The phase is re-evaluated when a countdown calls `onBoundary`; while the server still
 * reports the old status (a refetch that raced the boundary) the query polls every 2 s.
 */
export function useContest(slug: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.contests.detail(slug),
    queryFn: ({ signal }) =>
      api.get(`/contests/${encodeURIComponent(slug)}`, { schema: ContestDetailSchema, signal }),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const serverNow = Date.now() + offsetOf(data, q.state.dataUpdatedAt);
      return contestPhase(data, serverNow) !== data.status ? 2000 : false;
    },
  });
  const offsetMs = offsetOf(query.data, query.dataUpdatedAt);
  // Client time of the last phase evaluation: set at mount and whenever a countdown ends.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const evaluatedAt = Math.max(checkedAt, query.dataUpdatedAt);
  const boundary = query.data ? contestBoundary(query.data, evaluatedAt + offsetMs) : null;

  /** A countdown crossed zero: re-evaluate the phase and refetch (problems, scoreboard). */
  const onBoundary = useCallback(() => {
    setCheckedAt(Date.now());
    void queryClient.invalidateQueries({ queryKey: qk.contests.all });
  }, [queryClient]);

  return { query, contest: query.data, offsetMs, boundary, evaluatedAt, onBoundary };
}
