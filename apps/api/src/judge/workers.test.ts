import type { PrismaClient, User } from '@prisma/client';
import { UnrecoverableError, type Job, type Worker } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import { createContest, createProblem, createSubmission, createUser } from '../../test/factories';
import { env } from '../config/env';
import { getRedis } from '../lib/redis';
import { recomputeRow } from '../modules/contests/scoreboard';
import { emitter } from '../realtime/emitter';
import { STUCK_AFTER_MS, failExhaustedJob, reconcileStuckRows } from './failure';
import {
  JOB_ATTEMPTS,
  enqueueGenerateOutputs,
  enqueuePlagiarism,
  enqueueRun,
  enqueueSubmission,
  getQueue,
  runKey,
  type StoredRun,
} from './queue';
import { createWorkers, startMetricsServer, type Processors } from './workers';

/**
 * Worker wiring against a real Redis (BullMQ attempts/backoff, the `failed` handler, the
 * reconciler, worker /metrics): A-06 and A-49. Processors are injected; the sandbox is not used.
 */
vi.mock('../modules/contests/scoreboard', async (importActual) => {
  const actual = await importActual<typeof import('../modules/contests/scoreboard')>();
  return { ...actual, recomputeRow: vi.fn(actual.recomputeRow) };
});

let prisma: PrismaClient;
let user: User;
const open: Worker[] = [];

const spies = {
  done: vi.spyOn(emitter, 'emitSubmissionDone'),
  run: vi.spyOn(emitter, 'emitRunResult'),
  scoreboard: vi.spyOn(emitter, 'emitScoreboardRow'),
};

const noop = async () => undefined;

function startWorkers(overrides: Partial<Processors> = {}): void {
  open.push(...createWorkers({ judge: noop, run: noop, plagiarism: noop, ...overrides }));
}

/** A BullMQ job as the `failed` event hands it over. */
const fakeJob = <T>(data: T, attemptsMade: number, attempts = JOB_ATTEMPTS) =>
  ({ id: 'fake', data, attemptsMade, opts: { attempts } }) as unknown as Job<T>;

const STALLED = new Error('job stalled more than allowable limit');

async function waitForStatus(id: string, status: string) {
  await expect
    .poll(async () => (await prisma.submission.findUnique({ where: { id } }))?.status, {
      timeout: 8000,
    })
    .toBe(status);
}

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  user = await createUser(prisma);
});

beforeEach(() => {
  for (const spy of Object.values(spies)) {
    spy.mockReset();
    spy.mockImplementation(() => undefined);
  }
  vi.mocked(recomputeRow).mockClear();
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((worker) => worker.close()));
});

afterAll(async () => {
  await Promise.all(open.splice(0).map((worker) => worker.close()));
});

describe('worker wiring: retries (A-49)', () => {
  it('retries a crashing run job with backoff until JOB_ATTEMPTS, then stores an IE result', async () => {
    const calls: number[] = [];
    startWorkers({
      run: async () => {
        calls.push(Date.now());
        throw new Error('sandbox exploded');
      },
    });
    const runId = await enqueueRun({
      userId: user.id,
      language: 'PYTHON',
      sourceCode: 'print(1)',
      input: '',
      timeLimitMs: 1000,
      memoryLimitMb: 256,
    });

    await expect
      .poll(async () => JSON.parse((await getRedis().get(runKey(runId))) ?? '{}').status, {
        timeout: 10_000,
      })
      .toBe('DONE');
    expect(calls).toHaveLength(JOB_ATTEMPTS);
    // Exponential backoff from 1 s: about 1 s before attempt 2 and 2 s before attempt 3.
    expect(calls[1]! - calls[0]!).toBeGreaterThanOrEqual(900);
    expect(calls[2]! - calls[1]!).toBeGreaterThanOrEqual(1900);
    const stored = JSON.parse((await getRedis().get(runKey(runId))) as string) as StoredRun;
    expect(stored.result?.status).toBe('IE');
    expect(spies.run).toHaveBeenCalledTimes(1);
  });

  it('does not run a job id twice: the deterministic jobId dedupes a re-enqueue', async () => {
    await enqueueSubmission('dedupe-me');
    await enqueueSubmission('dedupe-me');
    const counts = await getQueue('judge').getJobCounts('waiting');
    expect(counts.waiting).toBe(1);
    await getQueue('judge').remove('sub-dedupe-me');
  });
});

describe('failed jobs end their rows (A-06)', () => {
  async function queuedSubmission(
    overrides: Parameters<typeof createSubmission>[1] extends infer T ? Partial<T> : never = {},
  ) {
    const problem = await createProblem(prisma);
    return createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      status: 'RUNNING',
      ...overrides,
    });
  }

  it('a stalled-out job leaves the submission FAILED/IE and emits submission:done', async () => {
    const submission = await queuedSubmission();
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'SUBMISSION', submissionId: submission.id }, 0),
      STALLED,
    );

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row).toMatchObject({ status: 'FAILED', verdict: 'IE' });
    expect(row.errorMessage).toContain('stalled');
    expect(spies.done).toHaveBeenCalledWith(
      expect.objectContaining({ id: submission.id, status: 'FAILED', verdict: 'IE' }),
      user.id,
    );
  });

  it('through a real Worker: a job BullMQ stalled out (deferred failure) never runs and ends FAILED/IE', async () => {
    const submission = await queuedSubmission({ status: 'RUNNING' });
    await enqueueSubmission(submission.id);
    // What BullMQ's stalled-jobs script does once a job stalled more than maxStalledCount times.
    await getRedis().hset(
      `${env.QUEUE_PREFIX}:judge:sub-${submission.id}`,
      'defa',
      'job stalled more than allowable limit',
    );
    const processor = vi.fn(async () => undefined);
    startWorkers({ judge: processor });

    await waitForStatus(submission.id, 'FAILED');
    expect(processor).not.toHaveBeenCalled();
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.verdict).toBe('IE');
    expect(row.errorMessage).toContain('stalled');
  });

  it('through a real Worker: an UnrecoverableError ends the submission FAILED/IE', async () => {
    const submission = await queuedSubmission({ status: 'QUEUED' });
    startWorkers({
      judge: async () => {
        throw new UnrecoverableError('boom');
      },
    });
    await enqueueSubmission(submission.id);
    await waitForStatus(submission.id, 'FAILED');
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(row.verdict).toBe('IE');
    expect(row.errorMessage).toContain('boom');
  });

  it('through a real Worker: a job that exhausts its attempts ends FAILED/IE only after the last one', async () => {
    const submission = await queuedSubmission({ status: 'QUEUED' });
    let attempts = 0;
    startWorkers({
      judge: async () => {
        attempts += 1;
        // The row must still be retryable until the last attempt has failed.
        const row = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
        expect(row.status).toBe('QUEUED');
        throw new Error('crash');
      },
    });
    await enqueueSubmission(submission.id);
    await waitForStatus(submission.id, 'FAILED');
    expect(attempts).toBe(JOB_ATTEMPTS);
  });

  it('a failure BullMQ will still retry leaves the row alone', async () => {
    const submission = await queuedSubmission();
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'SUBMISSION', submissionId: submission.id }, 1),
      new Error('crash'),
    );
    expect(
      (await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } })).status,
    ).toBe('RUNNING');
    expect(spies.done).not.toHaveBeenCalled();
  });

  it('never overwrites a submission that is already DONE', async () => {
    const submission = await queuedSubmission({ status: 'DONE', verdict: 'AC' });
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'SUBMISSION', submissionId: submission.id }, 0),
      STALLED,
    );
    expect(
      await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({
      status: 'DONE',
      verdict: 'AC',
    });
    expect(spies.done).not.toHaveBeenCalled();
  });

  it('recomputes the contest scoreboard row of a failed contest submission', async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    const submission = await createSubmission(prisma, {
      userId: user.id,
      problemId: problem.id,
      contestId: contest.id,
      status: 'COMPILING',
    });
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'SUBMISSION', submissionId: submission.id }, 0),
      STALLED,
    );
    expect(recomputeRow).toHaveBeenCalledWith(contest.id, user.id);
  });

  it('fails a PENDING/RUNNING AdminJob and PlagiarismReport, not a DONE one', async () => {
    const problem = await createProblem(prisma);
    const running = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, status: 'RUNNING' },
    });
    const done = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, status: 'DONE' },
    });
    const report = await prisma.plagiarismReport.create({ data: { status: 'RUNNING' } });
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'GENERATE_OUTPUTS', adminJobId: running.id }, 0),
      STALLED,
    );
    await failExhaustedJob(
      'judge',
      fakeJob({ type: 'GENERATE_OUTPUTS', adminJobId: done.id }, 0),
      STALLED,
    );
    await failExhaustedJob('plagiarism', fakeJob({ reportId: report.id }, 0), STALLED);

    expect((await prisma.adminJob.findUniqueOrThrow({ where: { id: running.id } })).status).toBe(
      'FAILED',
    );
    expect((await prisma.adminJob.findUniqueOrThrow({ where: { id: done.id } })).status).toBe(
      'DONE',
    );
    const failedReport = await prisma.plagiarismReport.findUniqueOrThrow({
      where: { id: report.id },
    });
    expect(failedReport.status).toBe('FAILED');
    expect(failedReport.finishedAt).not.toBeNull();
  });
});

describe('reconcileStuckRows (A-06)', () => {
  const old = () => new Date(Date.now() - STUCK_AFTER_MS - 60_000);

  it('fails old non-terminal rows that have no live job, and only those', async () => {
    const problem = await createProblem(prisma);
    const make = (overrides: Partial<Parameters<typeof createSubmission>[1]> = {}) =>
      createSubmission(prisma, {
        userId: user.id,
        problemId: problem.id,
        status: 'QUEUED',
        createdAt: old(),
        ...overrides,
      });
    const orphan = await make();
    const running = await make({ status: 'RUNNING' });
    const young = await make({ createdAt: new Date() });
    const done = await make({ status: 'DONE', verdict: 'AC' });
    const backlogged = await make();
    await enqueueSubmission(backlogged.id); // a live waiting job: old but not lost

    const failed = await reconcileStuckRows();

    const statusOf = async (id: string) =>
      (await prisma.submission.findUniqueOrThrow({ where: { id } })).status;
    expect(failed).toBeGreaterThanOrEqual(2);
    expect(await statusOf(orphan.id)).toBe('FAILED');
    expect(await statusOf(running.id)).toBe('FAILED');
    expect(await statusOf(young.id)).toBe('QUEUED');
    expect(await statusOf(done.id)).toBe('DONE');
    expect(await statusOf(backlogged.id)).toBe('QUEUED');
    expect(spies.done).toHaveBeenCalledWith(
      expect.objectContaining({ id: orphan.id, status: 'FAILED', verdict: 'IE' }),
      user.id,
    );
    await getQueue('judge').remove(`sub-${backlogged.id}`);
  });

  it('also covers AdminJob and PlagiarismReport rows with no job', async () => {
    const problem = await createProblem(prisma);
    const adminJob = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, createdAt: old() },
    });
    const liveAdminJob = await prisma.adminJob.create({
      data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, createdAt: old() },
    });
    await enqueueGenerateOutputs(liveAdminJob.id);
    const report = await prisma.plagiarismReport.create({ data: { createdAt: old() } });
    const liveReport = await prisma.plagiarismReport.create({ data: { createdAt: old() } });
    await enqueuePlagiarism(liveReport.id);

    await reconcileStuckRows();

    expect((await prisma.adminJob.findUniqueOrThrow({ where: { id: adminJob.id } })).status).toBe(
      'FAILED',
    );
    expect(
      (await prisma.adminJob.findUniqueOrThrow({ where: { id: liveAdminJob.id } })).status,
    ).toBe('PENDING');
    expect(
      (await prisma.plagiarismReport.findUniqueOrThrow({ where: { id: report.id } })).status,
    ).toBe('FAILED');
    expect(
      (await prisma.plagiarismReport.findUniqueOrThrow({ where: { id: liveReport.id } })).status,
    ).toBe('PENDING');
    await getQueue('judge').remove(`gen-${liveAdminJob.id}`);
    await getQueue('plagiarism').remove(`plag-${liveReport.id}`);
  });
});

describe('worker /metrics (A-49)', () => {
  it('serves the Prometheus registry on /metrics and 404s elsewhere', async () => {
    const server = startMetricsServer(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(metrics.status).toBe(200);
      expect(metrics.headers.get('content-type')).toContain('text/plain');
      const body = await metrics.text();
      for (const name of [
        'judge_jobs_total',
        'judge_job_duration_seconds',
        'judge_queue_waiting',
      ]) {
        expect(body).toContain(`# TYPE ${name} `);
      }
      expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
