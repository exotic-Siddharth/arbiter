/* eslint-disable @typescript-eslint/no-unused-vars -- scaffold stub: lane A2 implements these (keep the signatures) */
import type { Language, QueueCounts } from '@arbiter/shared';

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

/** Enqueue {type:"SUBMISSION", submissionId} on `judge`. */
export async function enqueueSubmission(id: string): Promise<void> {
  throw new Error('not implemented: enqueueSubmission');
}

/** Enqueue a custom-input run on `run`; resolves to the new runId. */
export async function enqueueRun(job: RunJob): Promise<string> {
  throw new Error('not implemented: enqueueRun');
}

/** Enqueue {type:"GENERATE_OUTPUTS", adminJobId} on `judge`. */
export async function enqueueGenerateOutputs(adminJobId: string): Promise<void> {
  throw new Error('not implemented: enqueueGenerateOutputs');
}

/** Enqueue {reportId} on `plagiarism`. */
export async function enqueuePlagiarism(reportId: string): Promise<void> {
  throw new Error('not implemented: enqueuePlagiarism');
}

/** Job counts of the three queues (admin judge monitor, judge_queue_waiting metric). */
export async function getQueueCounts(): Promise<Record<QueueName, JobCounts>> {
  throw new Error('not implemented: getQueueCounts');
}
