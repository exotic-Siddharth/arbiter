import { ContestListSchema, type ContestSummary } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { computeServerOffset } from '@/lib/time';

export interface ContestList {
  contests: ContestSummary[];
  /** Server clock minus client clock in ms, from the response's Date header (1 s resolution). */
  offsetMs: number;
}

/**
 * GET /api/contests. The list has no serverTime field, so the clock offset (Review Focus 3)
 * comes from the HTTP Date header; pass `offsetMs` to Countdown and contestBoundary.
 */
export function useContestList(
  status?: 'running' | 'upcoming',
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: qk.contests.list(status),
    enabled: options.enabled,
    queryFn: async ({ signal }): Promise<ContestList> => {
      let offsetMs = 0;
      const contests = await api.get('/contests', {
        query: { status },
        schema: ContestListSchema,
        signal,
        onResponse: (response) => {
          offsetMs = computeServerOffset(response.headers.get('Date') ?? '', Date.now());
        },
      });
      return { contests, offsetMs };
    },
  });
}
