import type { RunResult } from '@arbiter/shared';
import { UnrecoverableError, type Job } from 'bullmq';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { emitter } from '../realtime/emitter';
import { failLostSubmission } from './processor';
import {
  RUN_TTL_SEC,
  getQueue,
  runKey,
  type JudgeJobData,
  type PlagiarismJobData,
  type QueueName,
  type RunJobData,
  type StoredRun,
} from './queue';

/**
 * Terminal states for jobs BullMQ gives up on (A-06). The processors write DONE/FAILED
 * themselves, but a job that stalls twice (worker killed mid-judge) is failed by BullMQ without
 * the processor running again, and a crash between the row insert and the enqueue (or a Redis
 * flush) leaves a row with no job at all. Every write here is conditional on the row still being
 * non-terminal, so a late processor or a second worker can never be overwritten.
 */
const log = logger.child({ component: 'judge-failure' });

/** A QUEUED row without a job is only judged orphaned after this long (insert-to-enqueue gap). */
export const STUCK_AFTER_MS = 5 * 60_000;
const SWEEP_BATCH = 200;
const ERROR_MESSAGE_CHARS = 2000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** True when BullMQ will not run this job again: retries used up, unrecoverable, or stalled out. */
export function isTerminalFailure(job: Job, error: Error): boolean {
  return (
    error instanceof UnrecoverableError ||
    /stalled more than allowable limit/i.test(error.message) ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
}

async function failAdminJob(adminJobId: string, message: string): Promise<void> {
  await prisma.adminJob.updateMany({
    where: { id: adminJobId, status: { in: ['PENDING', 'RUNNING'] } },
    data: {
      status: 'FAILED',
      error: message.slice(0, ERROR_MESSAGE_CHARS),
      finishedAt: new Date(),
    },
  });
}

async function failPlagiarismReport(reportId: string, message: string): Promise<void> {
  await prisma.plagiarismReport.updateMany({
    where: { id: reportId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'FAILED', error: message.slice(0, 1000), finishedAt: new Date() },
  });
}

/** A custom-input run that never finished: store an IE result unless a result is already there. */
async function failRun(job: RunJobData): Promise<void> {
  const redis = getRedis();
  const raw = await redis.get(runKey(job.runId));
  if (raw !== null && (JSON.parse(raw) as StoredRun).status === 'DONE') return;
  const result: RunResult = {
    runId: job.runId,
    status: 'IE',
    stdout: '',
    stderr: '',
    compileOutput: null,
    timeMs: 0,
    memoryKb: 0,
  };
  const stored: StoredRun = { userId: job.userId, status: 'DONE', result };
  await redis.set(runKey(job.runId), JSON.stringify(stored), 'EX', RUN_TTL_SEC);
  try {
    emitter.emitRunResult(job.userId, result);
  } catch (error) {
    log.warn({ err: messageOf(error) }, 'socket emit failed');
  }
}

/**
 * Worker `failed` handler: when the job is out of retries (or stalled out), end its row as
 * FAILED/IE. A failure BullMQ will still retry leaves the row alone (the processor resets it).
 */
export async function failExhaustedJob(
  queue: QueueName,
  job: Job | undefined,
  error: Error,
): Promise<void> {
  if (!job || !isTerminalFailure(job, error)) return;
  const message = `Judging failed: ${error.message}`;
  try {
    if (queue === 'judge') {
      const data = job.data as JudgeJobData;
      if (data.type === 'SUBMISSION') await failLostSubmission(data.submissionId, message);
      else await failAdminJob(data.adminJobId, message);
    } else if (queue === 'plagiarism') {
      await failPlagiarismReport((job.data as PlagiarismJobData).reportId, message);
    } else {
      await failRun(job.data as RunJobData);
    }
  } catch (cause) {
    log.error({ queue, jobId: job.id, err: messageOf(cause) }, 'could not record a job failure');
  }
}

/** No live BullMQ job for this id: never enqueued, flushed with Redis, or already failed. */
async function jobIsGone(queue: QueueName, jobId: string): Promise<boolean> {
  const job = await getQueue(queue).getJob(jobId);
  if (!job) return true;
  const state = await job.getState();
  return state === 'failed' || state === 'completed' || state === 'unknown';
}

/**
 * Periodic reconciler: fails submissions, admin jobs and plagiarism reports that sit in a
 * non-terminal state with no live job behind them. Rows with a waiting, delayed or active job
 * are left alone, however old they are (a long backlog is not a failure). Returns the count.
 */
export async function reconcileStuckRows(now: number = Date.now()): Promise<number> {
  const olderThan = new Date(now - STUCK_AFTER_MS);
  const lost = 'The judge job was lost before it finished. Please submit again.';
  let failed = 0;

  const submissions = await prisma.submission.findMany({
    where: { status: { in: ['QUEUED', 'COMPILING', 'RUNNING'] }, createdAt: { lt: olderThan } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH,
  });
  for (const { id } of submissions) {
    if (!(await jobIsGone('judge', `sub-${id}`))) continue;
    await failLostSubmission(id, lost);
    failed += 1;
  }

  const adminJobs = await prisma.adminJob.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: olderThan } },
    select: { id: true },
    take: SWEEP_BATCH,
  });
  for (const { id } of adminJobs) {
    if (!(await jobIsGone('judge', `gen-${id}`))) continue;
    await failAdminJob(id, 'The generate-outputs job was lost before it finished.');
    failed += 1;
  }

  const reports = await prisma.plagiarismReport.findMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: olderThan } },
    select: { id: true },
    take: SWEEP_BATCH,
  });
  for (const { id } of reports) {
    if (!(await jobIsGone('plagiarism', `plag-${id}`))) continue;
    await failPlagiarismReport(id, 'The plagiarism job was lost before it finished.');
    failed += 1;
  }

  if (failed > 0) log.warn({ failed }, 'reconciler ended rows whose job was lost');
  return failed;
}
