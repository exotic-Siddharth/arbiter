import { SubmissionDetailSchema, type SubmissionDetail } from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useRoom, useSocketEvent, useSocketStatus } from '@/lib/socket';
import {
  applyProgressEvent,
  initialProgress,
  isPendingStatus,
  mergeProgress,
  progressFromSubmission,
  type ProgressEvent,
  type SubmissionProgress,
} from '../lib/progress';

/** Poll intervals while a submission is pending (socket events usually arrive first). */
const POLL_CONNECTED_MS = 8000;
const POLL_OFFLINE_MS = 2000;

export interface UseSubmissionProgressResult {
  /** null until the first snapshot or event for this id. */
  progress: SubmissionProgress | null;
  /** The REST detail (source code, compile output, failed sample, per-test rows). */
  detail: SubmissionDetail | undefined;
  /** True while the submission is queued, compiling or running. */
  isPending: boolean;
  query: ReturnType<typeof useQuery<SubmissionDetail>>;
}

export function submissionDetailQuery(id: string) {
  return {
    queryKey: qk.submissions.detail(id),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.get(`/submissions/${encodeURIComponent(id)}`, {
        schema: SubmissionDetailSchema,
        signal,
      }),
  };
}

/**
 * Live progress of one submission (R6): joins `submission:<id>` with useRoom (re-joins and
 * refetches on every reconnect), applies submission:status/test/done events for this id only,
 * and merges them over GET /submissions/:id. While pending it also polls, slowly when the socket
 * is connected and quickly when it is not, so the UI always reaches a final state.
 */
export function useSubmissionProgress(id: string | null): UseSubmissionProgressResult {
  const queryClient = useQueryClient();
  const socketStatus = useSocketStatus();
  const [live, setLive] = useState<SubmissionProgress | null>(null);

  const query = useQuery({
    ...submissionDetailQuery(id ?? ''),
    enabled: id !== null,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data || !isPendingStatus(data.status)) return false;
      return socketStatus === 'connected' ? POLL_CONNECTED_MS : POLL_OFFLINE_MS;
    },
  });

  useRoom('submission:subscribe', id ? { id } : null, {
    invalidate: id ? [qk.submissions.detail(id)] : [],
  });

  const apply = useCallback(
    (event: ProgressEvent) => {
      if (!id || event.payload.id !== id) return;
      setLive((previous) =>
        applyProgressEvent(previous?.id === id ? previous : initialProgress(id), event),
      );
    },
    [id],
  );

  const enabled = id !== null;
  useSocketEvent('submission:status', (payload) => apply({ type: 'status', payload }), {
    enabled,
  });
  useSocketEvent('submission:test', (payload) => apply({ type: 'test', payload }), { enabled });
  useSocketEvent(
    'submission:done',
    (payload) => {
      if (payload.id !== id) return;
      apply({ type: 'done', payload });
      // The final detail carries the failed sample, compile output and every test row.
      void queryClient.invalidateQueries({ queryKey: qk.submissions.detail(payload.id) });
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'list'] });
      void queryClient.invalidateQueries({ queryKey: qk.problems.all });
      void queryClient.invalidateQueries({ queryKey: qk.contests.all });
    },
    { enabled },
  );

  const data = id !== null && query.data?.id === id ? query.data : undefined;
  const progress = useMemo(
    () => mergeProgress(data ? progressFromSubmission(data) : null, live?.id === id ? live : null),
    [data, live, id],
  );

  return {
    progress,
    detail: data,
    isPending: progress ? isPendingStatus(progress.status) : id !== null,
    query,
  };
}
