import type { Language, QueueCounts, RunResult } from '@arbiter/shared';
import { Queue, type JobsOptions } from 'bullmq';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { onShutdown } from '../lib/lifecycle';
import { createRedisConnection, getRedis } from '../lib/redis';

/**
 * BullMQ queues (spec section 8.8), prefix env.QUEUE_PREFIX. Connections must come from
 * createRedisConnection() in lib/redis.ts (R17). Owner: lane A2.
 */
export const QUEUE_NAMES = {
  judge: 'judge',
  run: 'run',
  plagiarism: 'plagiarism',
} as const;
export type QueueName = keyof typeof QUEUE_NAMES;

/** Jobs on the `judge` queue. A REFERENCE-kind submission also uses type SUBMISSION. */
export type JudgeJobData =
  { type: 'SUBMISSION'; submissionId: string } | { type: 'GENERATE_OUTPUTS'; adminJobId: string };

/** A custom-input run requested through POST /api/runs (limits already resolved, R11). */
export interface RunJob {
  userId: string;
  language: Language;
  sourceCode: string;
  input: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

/** Data of a job on the `run` queue. */
export interface RunJobData extends RunJob {
  runId: string;
}

/** Data of a job on the `plagiarism` queue. */
export interface PlagiarismJobData {
  reportId: string;
}

/** BullMQ getJobCounts() subset: { waiting, active, completed, failed, delayed }. */
export type JobCounts = QueueCounts;

/** A crashed job is retried up to 2 times with backoff before it ends FAILED/IE (spec 8.4). */
export const JOB_ATTEMPTS = 3;
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
};

/** Redis key of a run (spec 8.6: TTL 10 min). */
export const runKey = (runId: string) => `run:${runId}`;
export const RUN_TTL_SEC = 600;

/** Value of run:<runId>: the owner, and the result once the run is done. */
export interface StoredRun {
  userId: string;
  status: 'PENDING' | 'DONE';
  result?: RunResult;
}

const queues = new Map<QueueName, Queue>();

/** The queue instance (created lazily, closed by closeAll()). */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    const created = new Queue(QUEUE_NAMES[name], {
      connection: createRedisConnection(),
      prefix: env.QUEUE_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, created);
    onShutdown(`queue-${name}`, async () => {
      queues.delete(name);
      await created.close();
    });
    queue = created;
  }
  return queue;
}

/** Enqueue {type:"SUBMISSION", submissionId} on `judge`. */
export async function enqueueSubmission(id: string): Promise<void> {
  const data: JudgeJobData = { type: 'SUBMISSION', submissionId: id };
  await getQueue('judge').add('submission', data, { jobId: `sub-${id}` });
}

/** Enqueue a custom-input run on `run`; resolves to the new runId. */
export async function enqueueRun(job: RunJob): Promise<string> {
  const runId = nanoid(16);
  const pending: StoredRun = { userId: job.userId, status: 'PENDING' };
  await getRedis().set(runKey(runId), JSON.stringify(pending), 'EX', RUN_TTL_SEC);
  const data: RunJobData = { ...job, runId };
  await getQueue('run').add('run', data, { jobId: `run-${runId}` });
  return runId;
}

/** Enqueue {type:"GENERATE_OUTPUTS", adminJobId} on `judge`. */
export async function enqueueGenerateOutputs(adminJobId: string): Promise<void> {
  const data: JudgeJobData = { type: 'GENERATE_OUTPUTS', adminJobId };
  await getQueue('judge').add('generate-outputs', data, { jobId: `gen-${adminJobId}` });
}

/** Enqueue {reportId} on `plagiarism`. */
export async function enqueuePlagiarism(reportId: string): Promise<void> {
  const data: PlagiarismJobData = { reportId };
  await getQueue('plagiarism').add('plagiarism', data, { jobId: `plag-${reportId}` });
}

async function countsOf(name: QueueName): Promise<JobCounts> {
  const counts = await getQueue(name).getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

/** Job counts of the three queues (admin judge monitor, judge_queue_waiting metric). */
export async function getQueueCounts(): Promise<Record<QueueName, JobCounts>> {
  const [judge, run, plagiarism] = await Promise.all([
    countsOf('judge'),
    countsOf('run'),
    countsOf('plagiarism'),
  ]);
  return { judge, run, plagiarism };
}
