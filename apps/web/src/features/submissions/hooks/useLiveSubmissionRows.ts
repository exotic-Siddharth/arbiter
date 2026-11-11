import type { SubmissionPage, SubmissionSummary } from '@arbiter/shared';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { useSocketEvent } from '@/lib/socket';
import { isPendingStatus, isTerminalStatus } from '@/features/problems/lib/progress';

export interface LiveRowState {
  /** Tests finished so far, per pending submission id (from submission:status/test). */
  testsDone: Record<string, number>;
  /** Ids that finished while this list was open (rows flash once). */
  justFinished: ReadonlySet<string>;
}

/**
 * Applies submission:status/test/done events to the rows of one cached list page, so pending
 * rows update in place. Events are hints: on `done` the list is refetched from REST.
 */
export function useLiveSubmissionRows(
  listKey: QueryKey,
  items: readonly SubmissionSummary[] | undefined,
): LiveRowState {
  const queryClient = useQueryClient();
  const [testsDone, setTestsDone] = useState<Record<string, number>>({});
  const [justFinished, setJustFinished] = useState<ReadonlySet<string>>(new Set());
  const pendingIds = new Set(
    (items ?? []).filter((item) => isPendingStatus(item.status)).map((item) => item.id),
  );
  const enabled = pendingIds.size > 0;

  const patch = (id: string, update: (row: SubmissionSummary) => SubmissionSummary) => {
    queryClient.setQueryData<SubmissionPage>(listKey, (page) =>
      page
        ? { ...page, items: page.items.map((row) => (row.id === id ? update(row) : row)) }
        : page,
    );
  };

  useSocketEvent(
    'submission:status',
    (event) => {
      if (!pendingIds.has(event.id)) return;
      patch(event.id, (row) =>
        isTerminalStatus(row.status)
          ? row
          : { ...row, status: event.status, testsTotal: event.testsTotal || row.testsTotal },
      );
      setTestsDone((previous) => ({
        ...previous,
        [event.id]: Math.max(previous[event.id] ?? 0, event.testsDone),
      }));
    },
    { enabled },
  );

  useSocketEvent(
    'submission:test',
    (event) => {
      if (!pendingIds.has(event.id)) return;
      patch(event.id, (row) =>
        isTerminalStatus(row.status) ? row : { ...row, status: 'RUNNING' },
      );
      setTestsDone((previous) => ({
        ...previous,
        [event.id]: Math.max(previous[event.id] ?? 0, event.ordinal),
      }));
    },
    { enabled },
  );

  useSocketEvent(
    'submission:done',
    (event) => {
      if (!pendingIds.has(event.id)) return;
      patch(event.id, (row) => ({
        ...row,
        status: event.status,
        verdict: event.verdict,
        timeMs: event.timeMs,
        memoryKb: event.memoryKb,
        testsPassed: event.testsPassed,
        testsTotal: event.testsTotal,
        judgedAt: row.judgedAt ?? new Date().toISOString(),
      }));
      setJustFinished((previous) => new Set(previous).add(event.id));
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    { enabled },
  );

  return { testsDone, justFinished };
}
