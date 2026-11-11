import { LIMITS, type RunResult, type Verdict } from '@arbiter/shared';
import type { Job } from 'bullmq';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { recomputeRow } from '../modules/contests/scoreboard';
import { emitter } from '../realtime/emitter';
import { check } from './checker';
import { recordProcessed } from './heartbeat';
import { deriveLimits } from './languages';
import { judgeJobDuration, judgeJobsTotal } from './metrics';
import { RUN_TTL_SEC, runKey, type JudgeJobData, type RunJobData, type StoredRun } from './queue';
import { SandboxSession, type RawResult } from './sandbox';
import { toVerdict } from './verdict';

const log = logger.child({ component: 'judge' });

const NUL = String.fromCharCode(0);
const ERROR_MESSAGE_CHARS = 2000;

/** Postgres text cannot hold NUL bytes; program output may contain them. */
const pgText = (text: string) => (text.includes(NUL) ? text.split(NUL).join('') : text);

const head = (bytes: Buffer, max: number) => bytes.subarray(0, max).toString('utf8');
const tail = (bytes: Buffer, max: number) =>
  bytes.subarray(Math.max(0, bytes.length - max)).toString('utf8');
const truncate = (text: string, max: number) =>
  Buffer.byteLength(text) <= max ? text : head(Buffer.from(text, 'utf8'), max);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** BullMQ retries a crashed job (attempts = 3); only the last attempt records FAILED/IE. */
function isFinalAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/** Events are hints: a failed emit must never fail the job. */
function safeEmit(what: string, emit: () => void): void {
  try {
    emit();
  } catch (error) {
    log.warn({ event: what, err: messageOf(error) }, 'socket emit failed');
  }
}

/** BullMQ processor of the `judge` queue (SUBMISSION incl. REFERENCE, and GENERATE_OUTPUTS). Owner: A2. */
export async function processJudgeJob(job: Job<JudgeJobData>): Promise<void> {
  try {
    if (job.data.type === 'SUBMISSION') {
      await judgeSubmission(job.data.submissionId, isFinalAttempt(job));
    } else {
      await generateOutputs(job.data.adminJobId, isFinalAttempt(job));
    }
  } finally {
    recordProcessed();
  }
}

// ---------------------------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------------------------

async function loadSubmission(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      contest: { select: { slug: true } },
      problem: {
        select: {
          id: true,
          slug: true,
          title: true,
          isPublished: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          checker: true,
          floatTolerance: true,
          testCases: {
            orderBy: { ordinal: 'asc' },
            select: { ordinal: true, input: true, expectedOutput: true, isSample: true },
          },
        },
      },
    },
  });
}

type LoadedSubmission = NonNullable<Awaited<ReturnType<typeof loadSubmission>>>;

interface Outcome {
  verdict: Verdict;
  timeMs: number | null;
  memoryKb: number | null;
  testsPassed: number;
  compileOutput: string | null;
}

async function judgeSubmission(submissionId: string, finalAttempt: boolean): Promise<void> {
  const startedAt = performance.now();
  const submission = await loadSubmission(submissionId);
  if (!submission) {
    log.warn({ submissionId }, 'submission not found; job dropped');
    return;
  }
  if (submission.status === 'DONE' || submission.status === 'FAILED') {
    log.info({ submissionId }, 'submission already judged; job skipped');
    return;
  }
  const { problem, language } = submission;
  const tests = problem.testCases;
  const testsTotal = tests.length;
  if (testsTotal === 0) {
    // Nothing to compare against: every compiling program would pass vacuously (A-02).
    await failSubmission(submission, 'The problem has no test cases', startedAt);
    return;
  }

  // A retried job starts from a clean slate.
  await prisma.$transaction([
    prisma.submissionTestResult.deleteMany({ where: { submissionId } }),
    prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'COMPILING',
        verdict: null,
        testsPassed: 0,
        testsTotal,
        timeMs: null,
        memoryKb: null,
        compileOutput: null,
        errorMessage: null,
        judgedAt: null,
      },
    }),
  ]);
  safeEmit('submission:status', () =>
    emitter.emitSubmissionStatus({
      id: submissionId,
      status: 'COMPILING',
      testsDone: 0,
      testsTotal,
    }),
  );

  const limits = deriveLimits(problem, language);
  let session: SandboxSession | undefined;
  try {
    let outcome: Outcome;
    session = await SandboxSession.start({
      jobId: submissionId,
      language,
      sourceCode: submission.sourceCode,
      memoryLimitMb: problem.memoryLimitMb,
      limits,
      testCount: testsTotal,
    });
    const compiled = await session.compile();
    if (!compiled.ok) {
      outcome = {
        verdict: 'CE',
        timeMs: null,
        memoryKb: null,
        testsPassed: 0,
        compileOutput: pgText(truncate(compiled.output, LIMITS.compileOutputBytes)),
      };
    } else {
      await prisma.submission.update({ where: { id: submissionId }, data: { status: 'RUNNING' } });
      safeEmit('submission:status', () =>
        emitter.emitSubmissionStatus({
          id: submissionId,
          status: 'RUNNING',
          testsDone: 0,
          testsTotal,
        }),
      );
      outcome = await runTests(session, submission, compiled.output);
    }
    await session.close();
    session = undefined;
    await finishSubmission(submission, outcome, startedAt);
  } catch (error) {
    await session?.close().catch(() => undefined);
    session = undefined;
    if (!finalAttempt) {
      log.warn({ submissionId, err: messageOf(error) }, 'judge attempt failed; will retry');
      await prisma.submission
        .update({ where: { id: submissionId }, data: { status: 'QUEUED' } })
        .catch(() => undefined);
      safeEmit('submission:status', () =>
        emitter.emitSubmissionStatus({
          id: submissionId,
          status: 'QUEUED',
          testsDone: 0,
          testsTotal,
        }),
      );
      throw error;
    }
    await failSubmission(submission, messageOf(error), startedAt);
    return;
  } finally {
    await session?.close().catch(() => undefined);
  }
}

async function runTests(
  session: SandboxSession,
  submission: LoadedSubmission,
  compilerOutput: string,
): Promise<Outcome> {
  const { problem } = submission;
  const tests = problem.testCases;
  let testsPassed = 0;
  let timeMs = 0;
  let memoryKb = 0;
  let verdict: Verdict = 'AC';
  for (const [index, test] of tests.entries()) {
    const raw: RawResult = await session.runTest(String(test.ordinal), test.input);
    const passed =
      raw.status === 'OK' &&
      check(
        problem.checker,
        test.expectedOutput,
        raw.stdout.toString('utf8'),
        problem.floatTolerance,
      );
    const testVerdict = toVerdict(raw, passed);
    timeMs = Math.max(timeMs, raw.cpuMs);
    memoryKb = Math.max(memoryKb, raw.maxRssKb);
    if (testVerdict === 'AC') testsPassed += 1;

    // R6: persist each result as it finishes, so a refetch restores the chips.
    await prisma.$transaction([
      prisma.submissionTestResult.create({
        data: {
          submissionId: submission.id,
          ordinal: test.ordinal,
          verdict: testVerdict,
          timeMs: raw.cpuMs,
          memoryKb: raw.maxRssKb,
          isSample: test.isSample,
          outputPreview: test.isSample
            ? pgText(head(raw.stdout, LIMITS.sampleOutputPreviewBytes))
            : null,
          stderrPreview: test.isSample ? pgText(tail(raw.stderr, LIMITS.stderrBytes)) : null,
        },
      }),
      prisma.submission.update({
        where: { id: submission.id },
        data: { testsPassed, timeMs, memoryKb },
      }),
    ]);
    safeEmit('submission:test', () =>
      emitter.emitSubmissionTest({
        id: submission.id,
        ordinal: test.ordinal,
        verdict: testVerdict,
        timeMs: raw.cpuMs,
        memoryKb: raw.maxRssKb,
        isSample: test.isSample,
      }),
    );
    if (testVerdict !== 'AC') {
      verdict = testVerdict;
      break;
    }
    if (index + 1 < tests.length) {
      safeEmit('submission:status', () =>
        emitter.emitSubmissionStatus({
          id: submission.id,
          status: 'RUNNING',
          testsDone: index + 1,
          testsTotal: tests.length,
        }),
      );
    }
  }
  const warnings = compilerOutput.trim();
  return {
    verdict,
    timeMs: tests.length > 0 ? timeMs : 0,
    memoryKb: tests.length > 0 ? memoryKb : 0,
    testsPassed,
    compileOutput: warnings ? pgText(truncate(compilerOutput, LIMITS.compileOutputBytes)) : null,
  };
}

async function finishSubmission(
  submission: LoadedSubmission,
  outcome: Outcome,
  startedAt: number,
): Promise<void> {
  const judgedAt = new Date();
  const isNormal = submission.kind === 'NORMAL';
  const committed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id: submission.id, status: { in: ['COMPILING', 'RUNNING'] } },
      data: {
        status: 'DONE',
        verdict: outcome.verdict,
        timeMs: outcome.timeMs,
        memoryKb: outcome.memoryKb,
        testsPassed: outcome.testsPassed,
        compileOutput: outcome.compileOutput,
        judgedAt,
      },
    });
    // R7: NORMAL submissions that reach DONE (CE included) count; AC also counts as accepted.
    if (count === 1 && isNormal) {
      await tx.problem.update({
        where: { id: submission.problemId },
        data: {
          submissionCount: { increment: 1 },
          ...(outcome.verdict === 'AC' ? { acceptedCount: { increment: 1 } } : {}),
        },
      });
    }
    return count === 1;
  });
  if (!committed) {
    log.warn({ submissionId: submission.id }, 'submission finished elsewhere; result discarded');
    return;
  }
  const durationSec = (performance.now() - startedAt) / 1000;
  judgeJobsTotal.inc({ verdict: outcome.verdict, language: submission.language });
  judgeJobDuration.observe({ language: submission.language }, durationSec);
  log.info(
    {
      submissionId: submission.id,
      verdict: outcome.verdict,
      language: submission.language,
      durationMs: Math.round(durationSec * 1000),
    },
    'submission judged',
  );

  safeEmit('submission:done', () =>
    emitter.emitSubmissionDone(
      {
        id: submission.id,
        status: 'DONE',
        verdict: outcome.verdict,
        timeMs: outcome.timeMs,
        memoryKb: outcome.memoryKb,
        testsPassed: outcome.testsPassed,
        testsTotal: submission.problem.testCases.length,
      },
      submission.userId,
    ),
  );
  if (isNormal && submission.contestId === null && submission.problem.isPublished) {
    safeEmit('feed:judged', () =>
      emitter.emitFeedJudged({
        username: submission.user.username,
        problemSlug: submission.problem.slug,
        problemTitle: submission.problem.title,
        language: submission.language,
        verdict: outcome.verdict,
        timeMs: outcome.timeMs,
        at: judgedAt.toISOString(),
      }),
    );
  }
  await updateScoreboard(submission);
}

async function failSubmission(
  submission: LoadedSubmission,
  message: string,
  startedAt: number | undefined,
): Promise<void> {
  const errorMessage = message.slice(0, ERROR_MESSAGE_CHARS);
  log.error({ submissionId: submission.id, err: errorMessage }, 'submission failed (IE)');
  // Conditional: never overwrite a submission that ended meanwhile (late processor, sweeper).
  const { count } = await prisma.submission.updateMany({
    where: { id: submission.id, status: { notIn: ['DONE', 'FAILED'] } },
    data: { status: 'FAILED', verdict: 'IE', errorMessage, judgedAt: new Date() },
  });
  if (count === 0) {
    log.warn({ submissionId: submission.id }, 'submission already ended; failure discarded');
    return;
  }
  const current = await prisma.submission.findUnique({
    where: { id: submission.id },
    select: { testsPassed: true, timeMs: true, memoryKb: true },
  });
  judgeJobsTotal.inc({ verdict: 'IE', language: submission.language });
  if (startedAt !== undefined) {
    judgeJobDuration.observe(
      { language: submission.language },
      (performance.now() - startedAt) / 1000,
    );
  }
  safeEmit('submission:done', () =>
    emitter.emitSubmissionDone(
      {
        id: submission.id,
        status: 'FAILED',
        verdict: 'IE',
        timeMs: current?.timeMs ?? null,
        memoryKb: current?.memoryKb ?? null,
        testsPassed: current?.testsPassed ?? 0,
        testsTotal: submission.problem.testCases.length,
      },
      submission.userId,
    ),
  );
  await updateScoreboard(submission);
}

/**
 * Ends a submission whose job is gone for good (failed out of BullMQ, stalled twice, lost with
 * Redis): FAILED/IE unless it already ended, then the done event and the scoreboard row.
 */
export async function failLostSubmission(submissionId: string, message: string): Promise<void> {
  const submission = await loadSubmission(submissionId);
  if (!submission || submission.status === 'DONE' || submission.status === 'FAILED') return;
  await failSubmission(submission, message, undefined);
}

/** R3: after any terminal state of a contest submission, recompute and emit the user's row. */
async function updateScoreboard(submission: LoadedSubmission): Promise<void> {
  if (submission.kind !== 'NORMAL' || !submission.contestId || !submission.contest) return;
  const contestId = submission.contestId;
  const contestSlug = submission.contest.slug;
  try {
    const row = await recomputeRow(contestId, submission.userId);
    if (row)
      safeEmit('scoreboard:row', () => emitter.emitScoreboardRow(contestId, { contestSlug, row }));
  } catch (error) {
    log.error(
      { submissionId: submission.id, contestId, err: messageOf(error) },
      'scoreboard update failed',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Generate outputs (admin)
// ---------------------------------------------------------------------------------------------

class JobFailure extends Error {}

async function generateOutputs(adminJobId: string, finalAttempt: boolean): Promise<void> {
  const adminJob = await prisma.adminJob.findUnique({ where: { id: adminJobId } });
  if (!adminJob) {
    log.warn({ adminJobId }, 'admin job not found; job dropped');
    return;
  }
  if (adminJob.status === 'DONE' || adminJob.status === 'FAILED') return;

  const fail = async (error: string) => {
    log.warn({ adminJobId, err: error }, 'generate outputs failed');
    await prisma.adminJob.update({
      where: { id: adminJobId },
      data: {
        status: 'FAILED',
        error: error.slice(0, ERROR_MESSAGE_CHARS),
        finishedAt: new Date(),
      },
    });
  };

  const problem = await prisma.problem.findUnique({
    where: { id: adminJob.problemId },
    select: {
      id: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      referenceLanguage: true,
      referenceSolution: true,
      testCases: { orderBy: { ordinal: 'asc' }, select: { id: true, ordinal: true, input: true } },
    },
  });
  if (!problem) return fail('The problem no longer exists');
  const { referenceLanguage: language, referenceSolution: sourceCode } = problem;
  if (!language || !sourceCode) return fail('The problem has no reference solution');

  const tests = problem.testCases;
  await prisma.adminJob.update({
    where: { id: adminJobId },
    data: { status: 'RUNNING', progress: 0, total: tests.length, error: null },
  });

  let session: SandboxSession | undefined;
  try {
    session = await SandboxSession.start({
      jobId: adminJobId,
      language,
      sourceCode,
      memoryLimitMb: problem.memoryLimitMb,
      limits: deriveLimits(problem, language),
      testCount: tests.length,
    });
    const compiled = await session.compile();
    if (!compiled.ok) {
      throw new JobFailure(
        `The reference solution does not compile:\n${truncate(compiled.output, 1500)}`,
      );
    }
    const outputs: { id: string; expectedOutput: string }[] = [];
    for (const [index, test] of tests.entries()) {
      const raw = await session.runTest(String(test.ordinal), test.input);
      if (raw.status !== 'OK') {
        throw new JobFailure(`The reference solution got ${raw.status} on test ${test.ordinal}`);
      }
      if (raw.stdout.length > LIMITS.testDataBytes) {
        throw new JobFailure(`The output of test ${test.ordinal} exceeds 4 MB`);
      }
      const text = raw.stdout.toString('utf8');
      if (text.includes(NUL)) {
        throw new JobFailure(`The output of test ${test.ordinal} contains NUL bytes`);
      }
      outputs.push({ id: test.id, expectedOutput: text });
      await prisma.adminJob.update({ where: { id: adminJobId }, data: { progress: index + 1 } });
    }
    await prisma.$transaction([
      ...outputs.map((output) =>
        prisma.testCase.update({
          where: { id: output.id },
          data: { expectedOutput: output.expectedOutput },
        }),
      ),
      prisma.adminJob.update({
        where: { id: adminJobId },
        data: { status: 'DONE', progress: tests.length, finishedAt: new Date() },
      }),
    ]);
    log.info({ adminJobId, tests: tests.length }, 'expected outputs generated');
  } catch (error) {
    if (error instanceof JobFailure) return fail(error.message);
    if (!finalAttempt) {
      await prisma.adminJob
        .update({ where: { id: adminJobId }, data: { status: 'PENDING' } })
        .catch(() => undefined);
      throw error;
    }
    return fail(messageOf(error));
  } finally {
    await session?.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Custom-input runs
// ---------------------------------------------------------------------------------------------

/** BullMQ processor of the `run` queue (custom-input runs; result in Redis run:<runId>). Owner: A2. */
export async function processRunJob(job: Job<RunJobData>): Promise<void> {
  const { runId, userId, language, sourceCode, input, timeLimitMs, memoryLimitMb } = job.data;
  let result: RunResult;
  let session: SandboxSession | undefined;
  try {
    session = await SandboxSession.start({
      jobId: `run-${runId}`,
      language,
      sourceCode,
      memoryLimitMb,
      limits: deriveLimits({ timeLimitMs, memoryLimitMb }, language),
      testCount: 1,
    });
    const compiled = await session.compile();
    const compileOutput = compiled.output.trim()
      ? truncate(compiled.output, LIMITS.compileOutputBytes)
      : null;
    if (!compiled.ok) {
      result = {
        runId,
        status: 'CE',
        stdout: '',
        stderr: '',
        compileOutput,
        timeMs: 0,
        memoryKb: 0,
      };
    } else {
      const raw = await session.runTest('1', input);
      result = {
        runId,
        status: raw.status,
        stdout: head(raw.stdout, LIMITS.runStdoutBytes),
        stderr: tail(raw.stderr, LIMITS.stderrBytes),
        compileOutput,
        timeMs: raw.cpuMs,
        memoryKb: raw.maxRssKb,
      };
    }
  } catch (error) {
    if (!isFinalAttempt(job)) throw error;
    log.error({ runId, err: messageOf(error) }, 'run failed (IE)');
    result = {
      runId,
      status: 'IE',
      stdout: '',
      stderr: '',
      compileOutput: null,
      timeMs: 0,
      memoryKb: 0,
    };
  } finally {
    await session?.close().catch(() => undefined);
    recordProcessed();
  }
  const stored: StoredRun = { userId, status: 'DONE', result };
  await getRedis().set(runKey(runId), JSON.stringify(stored), 'EX', RUN_TTL_SEC);
  safeEmit('run:result', () => emitter.emitRunResult(userId, result));
}
