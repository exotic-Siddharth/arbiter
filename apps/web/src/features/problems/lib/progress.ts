import type {
  SubmissionDetail,
  SubmissionDoneEvent,
  SubmissionStatus,
  SubmissionStatusEvent,
  SubmissionSummary,
  SubmissionTestEvent,
  SubmissionTestResult,
  Verdict,
} from '@arbiter/shared';

/**
 * Live judging progress of one submission. Socket events (submission:status/test/done) are
 * hints applied on top of the REST snapshot (GET /submissions/:id), which stays the source of
 * truth (R6): `mergeProgress` combines both so a refetch never moves the UI backwards and a
 * missed event is filled in by the next refetch.
 */
export interface TestChipData {
  ordinal: number;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
  isSample: boolean;
}

export interface SubmissionProgress {
  id: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  testsDone: number;
  testsTotal: number;
  testsPassed: number;
  timeMs: number | null;
  memoryKb: number | null;
  /** Finished tests, sorted by ordinal. */
  tests: TestChipData[];
}

export type ProgressEvent =
  | { type: 'status'; payload: SubmissionStatusEvent }
  | { type: 'test'; payload: SubmissionTestEvent }
  | { type: 'done'; payload: SubmissionDoneEvent };

const STATUS_RANK: Record<SubmissionStatus, number> = {
  QUEUED: 0,
  COMPILING: 1,
  RUNNING: 2,
  DONE: 3,
  FAILED: 3,
};

export function isTerminalStatus(status: SubmissionStatus): boolean {
  return status === 'DONE' || status === 'FAILED';
}

export function isPendingStatus(status: SubmissionStatus): boolean {
  return !isTerminalStatus(status);
}

/** A submission whose judge could not finish: FAILED, or judged as an internal error. */
export function isJudgeFailure(progress: Pick<SubmissionProgress, 'status' | 'verdict'>): boolean {
  return progress.status === 'FAILED' || progress.verdict === 'IE';
}

export function initialProgress(id: string): SubmissionProgress {
  return {
    id,
    status: 'QUEUED',
    verdict: null,
    testsDone: 0,
    testsTotal: 0,
    testsPassed: 0,
    timeMs: null,
    memoryKb: null,
    tests: [],
  };
}

function upsertTest(tests: readonly TestChipData[], test: TestChipData): TestChipData[] {
  const next = tests.filter((existing) => existing.ordinal !== test.ordinal);
  next.push(test);
  next.sort((a, b) => a.ordinal - b.ordinal);
  return next;
}

/** Applies one socket event; events for other submissions and stale steps are ignored. */
export function applyProgressEvent(
  state: SubmissionProgress,
  event: ProgressEvent,
): SubmissionProgress {
  if (event.payload.id !== state.id) return state;
  const terminal = isTerminalStatus(state.status);

  switch (event.type) {
    case 'status': {
      const { status, testsDone, testsTotal } = event.payload;
      if (terminal || STATUS_RANK[status] < STATUS_RANK[state.status]) return state;
      return {
        ...state,
        status,
        testsDone: Math.max(state.testsDone, testsDone),
        testsTotal: testsTotal || state.testsTotal,
      };
    }
    case 'test': {
      if (terminal) return state;
      const { ordinal, verdict, timeMs, memoryKb, isSample } = event.payload;
      const tests = upsertTest(state.tests, { ordinal, verdict, timeMs, memoryKb, isSample });
      return {
        ...state,
        status: STATUS_RANK[state.status] < STATUS_RANK.RUNNING ? 'RUNNING' : state.status,
        tests,
        testsDone: Math.max(state.testsDone, tests.length),
        testsPassed: tests.filter((test) => test.verdict === 'AC').length,
      };
    }
    case 'done': {
      const { status, verdict, timeMs, memoryKb, testsPassed, testsTotal } = event.payload;
      return {
        ...state,
        status,
        verdict,
        timeMs,
        memoryKb,
        testsPassed,
        testsTotal: testsTotal || state.testsTotal,
        testsDone: Math.max(state.testsDone, state.tests.length),
      };
    }
  }
}

/** Progress from a REST summary or detail (results are inserted as each test finishes, R6). */
export function progressFromSubmission(
  submission: SubmissionSummary & { results?: SubmissionTestResult[] },
): SubmissionProgress {
  const tests = [...(submission.results ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  return {
    id: submission.id,
    status: submission.status,
    verdict: submission.verdict,
    testsDone: isTerminalStatus(submission.status)
      ? Math.max(tests.length, submission.testsPassed)
      : tests.length,
    testsTotal: submission.testsTotal,
    testsPassed: submission.testsPassed,
    timeMs: submission.timeMs,
    memoryKb: submission.memoryKb,
    tests,
  };
}

/**
 * Combines the REST snapshot with live events: whichever is further along wins, tests are the
 * union by ordinal (REST rows win), counters never go backwards.
 */
export function mergeProgress(
  rest: SubmissionProgress | null,
  live: SubmissionProgress | null,
): SubmissionProgress | null {
  if (!rest) return live;
  if (!live || live.id !== rest.id) return rest;
  const restRank = STATUS_RANK[rest.status];
  const liveRank = STATUS_RANK[live.status];
  const base =
    restRank > liveRank || (restRank === liveRank && isTerminalStatus(rest.status)) ? rest : live;

  let tests = live.tests;
  for (const test of rest.tests) tests = upsertTest(tests, test);

  return {
    ...base,
    tests,
    testsDone: Math.max(
      base.testsDone,
      tests.length,
      isTerminalStatus(base.status) ? 0 : rest.testsDone,
    ),
    testsTotal: base.testsTotal || rest.testsTotal || live.testsTotal,
    testsPassed: isTerminalStatus(base.status)
      ? base.testsPassed
      : Math.max(base.testsPassed, tests.filter((test) => test.verdict === 'AC').length),
  };
}

/** A detail placeholder from the 202 response, shown until GET /submissions/:id answers. */
export function detailFromSummary(summary: SubmissionSummary): SubmissionDetail {
  return { ...summary, sourceCode: null, compileOutput: null, results: [], failedSample: null };
}
