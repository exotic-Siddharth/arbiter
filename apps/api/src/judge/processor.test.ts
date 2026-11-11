import { ScoreRowSchema } from '@arbiter/shared';
import type { PrismaClient, User } from '@prisma/client';
import type { Job } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import { createContest, createProblem, createSubmission, createUser } from '../../test/factories';
import { waitForNoContainers } from '../../test/sandbox/helpers';
import { env } from '../config/env';
import { getRedis } from '../lib/redis';
import { recomputeRow } from '../modules/contests/scoreboard';
import { emitter } from '../realtime/emitter';
import { processJudgeJob, processRunJob } from './processor';
import { runKey, type JudgeJobData, type RunJobData, type StoredRun } from './queue';

/**
 * Judge processor against real Docker, Postgres and Redis (R20: `npm run test:sandbox`).
 * recomputeRow is the real implementation (lane A3b, wrapped in a spy to observe the calls);
 * socket emits are spied on.
 */
vi.mock('../modules/contests/scoreboard', async (importActual) => {
  const actual = await importActual<typeof import('../modules/contests/scoreboard')>();
  return { ...actual, recomputeRow: vi.fn(actual.recomputeRow) };
});

const ORIGINAL_IMAGE = env.SANDBOX_IMAGE;
let prisma: PrismaClient;
let user: User;
let admin: User;

const spies = {
  status: vi.spyOn(emitter, 'emitSubmissionStatus'),
  test: vi.spyOn(emitter, 'emitSubmissionTest'),
  done: vi.spyOn(emitter, 'emitSubmissionDone'),
  feed: vi.spyOn(emitter, 'emitFeedJudged'),
  scoreboard: vi.spyOn(emitter, 'emitScoreboardRow'),
  run: vi.spyOn(emitter, 'emitRunResult'),
};

/** A BullMQ job as the worker hands it over (attemptsMade = previous failed attempts). */
function fakeJob<T>(data: T, attemptsMade = 0, attempts = 1): Job<T> {
  return { id: 'test', data, attemptsMade, opts: { attempts } } as unknown as Job<T>;
}

const judge = (submissionId: string, attemptsMade = 0, attempts = 1) =>
  processJudgeJob(
    fakeJob<JudgeJobData>({ type: 'SUBMISSION', submissionId }, attemptsMade, attempts),
  );

const PY_SUM = 'a, b = map(int, input().split())\nprint(a + b)\n';

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  user = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

beforeEach(() => {
  for (const spy of Object.values(spies)) {
    spy.mockReset();
    spy.mockImplementation(() => undefined);
  }
  vi.mocked(recomputeRow).mockClear();
});

afterEach(() => {
  env.SANDBOX_IMAGE = ORIGINAL_IMAGE;
});

afterAll(async () => {
  expect(await waitForNoContainers()).toEqual([]);
});

describe('processJudgeJob: submissions', () => {
  it('a seeded problem plus a Python solution ends DONE/AC with testsPassed == testsTotal', async () => {
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      sourceCode: PY_SUM,
    });
    await judge(submission.id);

    const judged = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      include: { results: { orderBy: { ordinal: 'asc' } } },
    });
    expect(judged).toMatchObject({ status: 'DONE', verdict: 'AC', testsPassed: 5, testsTotal: 5 });
    expect(judged.judgedAt).not.toBeNull();
    expect(judged.timeMs).toBeGreaterThanOrEqual(0);
    expect(judged.memoryKb).toBeGreaterThan(0);
    expect(judged.results.map((r) => [r.ordinal, r.verdict, r.isSample])).toEqual([
      [1, 'AC', true],
      [2, 'AC', true],
      [3, 'AC', false],
      [4, 'AC', false],
      [5, 'AC', false],
    ]);
    // Hidden tests never store previews.
    expect(judged.results[2]?.outputPreview).toBeNull();

    // submission:test events, in order, then submission:done to the owner and the feed.
    expect(spies.test.mock.calls.map(([event]) => event.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(spies.status.mock.calls[0]?.[0]).toMatchObject({ status: 'COMPILING', testsTotal: 5 });
    expect(spies.done).toHaveBeenCalledWith(
      expect.objectContaining({ id: submission.id, status: 'DONE', verdict: 'AC', testsPassed: 5 }),
      user.id,
    );
    expect(spies.feed).toHaveBeenCalledWith(
      expect.objectContaining({
        problemSlug: problem.slug,
        verdict: 'AC',
        username: user.username,
      }),
    );
    expect(spies.scoreboard).not.toHaveBeenCalled();

    // The problem counters increment (R7).
    const counters = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(counters).toMatchObject({ submissionCount: 1, acceptedCount: 1 });
  });

  it('a submission WA on hidden test 3 stops at test 3', async () => {
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      sourceCode: 'a, b = map(int, input().split())\nprint(1 if a == 0 and b == 0 else a + b)\n',
    });
    await judge(submission.id);

    const judged = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      include: { results: { orderBy: { ordinal: 'asc' } } },
    });
    expect(judged).toMatchObject({ status: 'DONE', verdict: 'WA', testsPassed: 2, testsTotal: 5 });
    expect(judged.results.map((r) => r.verdict)).toEqual(['AC', 'AC', 'WA']);
    expect(spies.test.mock.calls.map(([event]) => [event.ordinal, event.verdict])).toEqual([
      [1, 'AC'],
      [2, 'AC'],
      [3, 'WA'],
    ]);
    const counters = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(counters).toMatchObject({ submissionCount: 1, acceptedCount: 0 });
  });

  it('a sample failure stores outputPreview and stderrPreview', async () => {
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      sourceCode:
        'import sys\na, b = map(int, input().split())\nprint("debug line", file=sys.stderr)\nprint(a - b)\n',
    });
    await judge(submission.id);

    const results = await prisma.submissionTestResult.findMany({
      where: { submissionId: submission.id },
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ordinal: 1,
      verdict: 'WA',
      isSample: true,
      outputPreview: '-1\n',
      stderrPreview: 'debug line\n',
    });
  });

  it('CE counts as a submission, and contest submissions update the scoreboard (R3)', async () => {
    const problem = await createProblem(prisma, { isPublished: false });
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      sourceCode: 'def broken(:\n',
    });
    await judge(submission.id);

    const judged = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(judged).toMatchObject({ status: 'DONE', verdict: 'CE', testsPassed: 0 });
    expect(judged.compileOutput).toMatch(/SyntaxError/);
    expect(spies.test).not.toHaveBeenCalled();
    expect(spies.feed).not.toHaveBeenCalled();
    expect(recomputeRow).toHaveBeenCalledWith(contest.id, user.id);
    expect(spies.scoreboard).toHaveBeenCalledTimes(1);
    const [contestId, payload] = spies.scoreboard.mock.calls[0];
    expect(contestId).toBe(contest.id);
    expect(payload.contestSlug).toBe(contest.slug);
    // The real recomputeRow output is schema-valid, and a CE is never a counted attempt.
    expect(ScoreRowSchema.safeParse(payload.row).success).toBe(true);
    expect(payload.row).toMatchObject({
      username: user.username,
      solved: 0,
      cells: [{ label: 'A', solved: false, attempts: 0 }],
    });
    const counters = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(counters).toMatchObject({ submissionCount: 1, acceptedCount: 0 });
  });

  it('an AC contest submission solves its cell on the real scoreboard (R3)', async () => {
    const problem = await createProblem(prisma, { isPublished: false });
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      sourceCode: PY_SUM,
    });
    await judge(submission.id);

    const [, payload] = spies.scoreboard.mock.calls[0];
    expect(ScoreRowSchema.safeParse(payload.row).success).toBe(true);
    expect(payload.row).toMatchObject({
      rank: 1,
      username: user.username,
      solved: 1,
      // attempts counts the tries before the first AC (R3): the AC itself is not one.
      cells: [{ label: 'A', solved: true, attempts: 0, firstSolve: true }],
    });
  });

  it('REFERENCE submissions never touch counters, feeds or scoreboards (R7)', async () => {
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      kind: 'REFERENCE',
      userId: admin.id,
      problemId: problem.id,
      sourceCode: PY_SUM,
    });
    await judge(submission.id);
    const judged = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(judged).toMatchObject({ status: 'DONE', verdict: 'AC' });
    expect(spies.feed).not.toHaveBeenCalled();
    expect(spies.scoreboard).not.toHaveBeenCalled();
    const counters = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(counters).toMatchObject({ submissionCount: 0, acceptedCount: 0 });
  });

  it('missing image yields IE with message', async () => {
    env.SANDBOX_IMAGE = 'arbiter-sandbox:missing-for-test';
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      sourceCode: PY_SUM,
    });

    // An early attempt rethrows (BullMQ retries it) and puts the submission back in the queue.
    await expect(judge(submission.id, 0, 3)).rejects.toThrow(/not available/);
    expect(
      (await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } })).status,
    ).toBe('QUEUED');

    // The last attempt records FAILED/IE with a clear errorMessage.
    await judge(submission.id, 2, 3);
    const judged = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(judged).toMatchObject({ status: 'FAILED', verdict: 'IE' });
    expect(judged.errorMessage).toMatch(/arbiter-sandbox:missing-for-test.*not available/);
    expect(spies.done).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: submission.id, status: 'FAILED', verdict: 'IE' }),
      user.id,
    );
    const counters = await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } });
    expect(counters).toMatchObject({ submissionCount: 0, acceptedCount: 0 });
  });
});

describe('processJudgeJob: generate outputs', () => {
  it('runs the reference on every input and overwrites expectedOutput', async () => {
    const problem = await createProblem(prisma, {
      referenceLanguage: 'PYTHON',
      referenceSolution: PY_SUM,
      tests: [
        { input: '1 2\n', expectedOutput: 'stale\n', isSample: true },
        { input: '5 5\n', expectedOutput: '' },
      ],
    });
    const job = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, total: 2 },
    });
    await processJudgeJob(fakeJob<JudgeJobData>({ type: 'GENERATE_OUTPUTS', adminJobId: job.id }));

    const done = await prisma.adminJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: 'DONE', progress: 2, total: 2, error: null });
    const tests = await prisma.testCase.findMany({
      where: { problemId: problem.id },
      orderBy: { ordinal: 'asc' },
    });
    expect(tests.map((t) => t.expectedOutput)).toEqual(['3\n', '10\n']);
  });

  it('fails the job when the reference does not pass every input', async () => {
    const problem = await createProblem(prisma, {
      referenceLanguage: 'PYTHON',
      referenceSolution: 'raise SystemExit(2)\n',
    });
    const job = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, total: 5 },
    });
    await processJudgeJob(fakeJob<JudgeJobData>({ type: 'GENERATE_OUTPUTS', adminJobId: job.id }));
    const failed = await prisma.adminJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toMatch(/RE on test 1/);
    const tests = await prisma.testCase.findMany({ where: { problemId: problem.id } });
    expect(tests.every((t) => t.expectedOutput !== '')).toBe(true);
  });
});

describe('processRunJob', () => {
  it('a run job stores run:<id> in Redis with stdout', async () => {
    const data: RunJobData = {
      runId: `r${Date.now().toString(36)}`,
      userId: user.id,
      language: 'PYTHON',
      sourceCode: 'import sys\nprint(sys.stdin.read().upper(), end="")\n',
      input: 'hello run\n',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
    };
    await processRunJob(fakeJob(data));
    const stored = JSON.parse((await getRedis().get(runKey(data.runId))) ?? 'null') as StoredRun;
    expect(stored).toMatchObject({
      userId: user.id,
      status: 'DONE',
      result: { runId: data.runId, status: 'OK', stdout: 'HELLO RUN\n', compileOutput: null },
    });
    expect(await getRedis().ttl(runKey(data.runId))).toBeGreaterThan(500);
    expect(spies.run).toHaveBeenCalledWith(user.id, stored.result);
  });

  it('reports CE with the compiler output', async () => {
    const data: RunJobData = {
      runId: `c${Date.now().toString(36)}`,
      userId: user.id,
      language: 'CPP',
      sourceCode: 'int main( {',
      input: '',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
    };
    await processRunJob(fakeJob(data));
    const stored = JSON.parse((await getRedis().get(runKey(data.runId))) ?? 'null') as StoredRun;
    expect(stored.result?.status).toBe('CE');
    expect(stored.result?.compileOutput).toMatch(/error/);
  });
});
