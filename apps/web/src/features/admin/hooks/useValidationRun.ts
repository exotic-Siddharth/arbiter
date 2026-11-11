import {
  SubmissionDetailSchema,
  type SubmissionDetail,
  type SubmissionStatus,
  type Verdict,
} from '@arbiter/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useRoom, useSocketEvent } from '@/lib/socket';

export interface ValidationTest {
  ordinal: number;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
  isSample: boolean;
}

export interface ValidationRun {
  status: SubmissionStatus;
  verdict: Verdict | null;
  testsDone: number;
  testsTotal: number;
  testsPassed: number;
  timeMs: number | null;
  memoryKb: number | null;
  tests: ValidationTest[];
  compileOutput: string | null;
  errorMessage: string | null;
  finished: boolean;
}

interface Live {
  id: string | null;
  status: { status: SubmissionStatus; testsDone: number; testsTotal: number } | null;
  tests: Map<number, ValidationTest>;
  done: {
    status: SubmissionStatus;
    verdict: Verdict | null;
    timeMs: number | null;
    memoryKb: number | null;
    testsPassed: number;
    testsTotal: number;
  } | null;
}

const EMPTY_LIVE: Live = { id: null, status: null, tests: new Map(), done: null };

/** QUEUED / COMPILING / RUNNING are in flight; DONE and FAILED are final. */
export function isFinished(status: SubmissionStatus | undefined): boolean {
  return status === 'DONE' || status === 'FAILED';
}

/**
 * Live verdict of a REFERENCE submission started from the admin console. It joins the
 * submission room (the owner is the admin), applies status/test/done events as they arrive and
 * keeps GET /api/submissions/:id as the source of truth: the query is refetched after every
 * (re)join, when the done event arrives, and polled every 3 s while the judge is still busy
 * (events are hints, so a dropped socket cannot leave the panel stuck).
 */
export function useValidationRun(submissionId: string | null): {
  run: ValidationRun | null;
  isLoading: boolean;
  error: unknown;
} {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<Live>(EMPTY_LIVE);
  const current = live.id === submissionId ? live : { ...EMPTY_LIVE, id: submissionId };

  useRoom('submission:subscribe', submissionId ? { id: submissionId } : null, {
    invalidate: submissionId ? [qk.submissions.detail(submissionId)] : [],
  });

  const detail = useQuery({
    queryKey: qk.submissions.detail(submissionId ?? ''),
    queryFn: ({ signal }) =>
      api.get<SubmissionDetail>(`/submissions/${submissionId}`, {
        schema: SubmissionDetailSchema,
        signal,
      }),
    enabled: submissionId !== null,
    staleTime: 0,
    refetchInterval: (query) => (isFinished(query.state.data?.status) ? false : 3000),
  });

  const update = (change: (previous: Live) => Live) =>
    setLive((previous) =>
      change(previous.id === submissionId ? previous : { ...EMPTY_LIVE, id: submissionId }),
    );

  useSocketEvent(
    'submission:status',
    (event) => {
      if (event.id !== submissionId) return;
      update((previous) => ({
        ...previous,
        status: { status: event.status, testsDone: event.testsDone, testsTotal: event.testsTotal },
      }));
    },
    { enabled: submissionId !== null },
  );
  useSocketEvent(
    'submission:test',
    (event) => {
      if (event.id !== submissionId) return;
      update((previous) => {
        const tests = new Map(previous.tests);
        tests.set(event.ordinal, {
          ordinal: event.ordinal,
          verdict: event.verdict,
          timeMs: event.timeMs,
          memoryKb: event.memoryKb,
          isSample: event.isSample,
        });
        return { ...previous, tests };
      });
    },
    { enabled: submissionId !== null },
  );
  useSocketEvent(
    'submission:done',
    (event) => {
      if (event.id !== submissionId) return;
      update((previous) => ({ ...previous, done: event }));
      void queryClient.invalidateQueries({ queryKey: qk.submissions.detail(event.id) });
    },
    { enabled: submissionId !== null },
  );

  if (!submissionId) return { run: null, isLoading: false, error: null };

  const data = detail.data;
  const merged = new Map<number, ValidationTest>();
  for (const result of data?.results ?? []) merged.set(result.ordinal, result);
  for (const [ordinal, test] of current.tests) merged.set(ordinal, test);
  const tests = [...merged.values()].sort((a, b) => a.ordinal - b.ordinal);

  // The fetched detail wins once it is final; before that the freshest event does.
  const dataFinal = isFinished(data?.status);
  const status: SubmissionStatus | null = dataFinal
    ? (data?.status ?? null)
    : (current.done?.status ?? current.status?.status ?? data?.status ?? null);
  if (!status) return { run: null, isLoading: detail.isPending, error: detail.error };

  const testsTotal = dataFinal
    ? (data?.testsTotal ?? 0)
    : Math.max(
        current.done?.testsTotal ?? 0,
        current.status?.testsTotal ?? 0,
        data?.testsTotal ?? 0,
      );
  const run: ValidationRun = {
    status,
    verdict: dataFinal ? (data?.verdict ?? null) : (current.done?.verdict ?? data?.verdict ?? null),
    testsDone: Math.max(tests.length, current.status?.testsDone ?? 0, data?.testsPassed ?? 0),
    testsTotal,
    testsPassed: dataFinal
      ? (data?.testsPassed ?? 0)
      : (current.done?.testsPassed ?? data?.testsPassed ?? 0),
    timeMs: dataFinal ? (data?.timeMs ?? null) : (current.done?.timeMs ?? data?.timeMs ?? null),
    memoryKb: dataFinal
      ? (data?.memoryKb ?? null)
      : (current.done?.memoryKb ?? data?.memoryKb ?? null),
    tests,
    compileOutput: data?.compileOutput ?? null,
    errorMessage: data?.errorMessage ?? null,
    finished: isFinished(status),
  };
  return { run, isLoading: detail.isPending && !run, error: detail.error };
}
