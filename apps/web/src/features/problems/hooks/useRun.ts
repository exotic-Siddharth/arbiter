import {
  CreateRunResponseSchema,
  RunStatusResponseSchema,
  type CreateRunBody,
  type RunResult,
} from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useSocketEvent, useSocketStatus } from '@/lib/socket';
import { toastError } from '@/lib/toast';

/** A run with no result after this long is shown as "Judge unavailable" (never spin forever). */
export const RUN_TIMEOUT_MS = 60_000;

export type RunPhase = 'idle' | 'starting' | 'running' | 'done' | 'unavailable';

export interface RunState {
  phase: RunPhase;
  result: RunResult | null;
  /** The input the run was started with (to compare against a sample's expected output). */
  input: string;
}

export interface UseRunResult extends RunState {
  start: (body: CreateRunBody) => void;
  isBusy: boolean;
}

/**
 * Custom-input runs: POST /runs, then the result arrives as `run:result` on the user's socket
 * room, with GET /runs/:runId polling as the REST fallback (events are hints).
 */
export function useRun(): UseRunResult {
  const queryClient = useQueryClient();
  const socketStatus = useSocketStatus();
  const [runId, setRunId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [timedOutId, setTimedOutId] = useState<string | null>(null);
  // run:result can arrive before POST /runs answers: keep it until the id is known.
  const early = useRef(new Map<string, RunResult>());

  const storeResult = useCallback(
    (result: RunResult) => {
      queryClient.setQueryData(qk.runs.detail(result.runId), { status: 'DONE', result });
    },
    [queryClient],
  );

  const mutation = useMutation({
    mutationFn: (body: CreateRunBody) =>
      api.post('/runs', body, { schema: CreateRunResponseSchema }),
    onSuccess: ({ runId: id }) => {
      const result = early.current.get(id);
      if (result) storeResult(result);
      early.current.clear();
      setRunId(id);
    },
    onError: (error) => {
      toastError(
        error,
        isApiError(error) && error.code === 'RATE_LIMITED' ? undefined : 'Run not started',
      );
    },
  });

  useSocketEvent('run:result', (result) => {
    if (result.runId === runId) storeResult(result);
    else early.current.set(result.runId, result);
  });

  const status = useQuery({
    queryKey: qk.runs.detail(runId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/runs/${encodeURIComponent(runId ?? '')}`, {
        schema: RunStatusResponseSchema,
        signal,
      }),
    enabled: runId !== null && timedOutId !== runId,
    refetchInterval: (q) =>
      q.state.data?.status === 'DONE' ? false : socketStatus === 'connected' ? 3000 : 1000,
    staleTime: Infinity,
  });

  const result = runId && status.data?.status === 'DONE' ? (status.data.result ?? null) : null;

  useEffect(() => {
    if (!runId || result) return;
    const timer = setTimeout(() => setTimedOutId(runId), RUN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [runId, result]);

  const start = useCallback(
    (body: CreateRunBody) => {
      setRunId(null);
      setTimedOutId(null);
      setInput(body.input);
      mutation.mutate(body);
    },
    [mutation],
  );

  let phase: RunPhase = 'idle';
  if (mutation.isPending) phase = 'starting';
  else if (runId) {
    if (result) phase = result.status === 'IE' ? 'unavailable' : 'done';
    else if (timedOutId === runId || status.isError) phase = 'unavailable';
    else phase = 'running';
  }

  return {
    phase,
    result,
    input,
    start,
    isBusy: phase === 'starting' || phase === 'running',
  };
}
