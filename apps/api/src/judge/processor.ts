/* eslint-disable @typescript-eslint/no-unused-vars -- scaffold stub: lane A2 implements these (keep the signatures) */
import type { Job } from 'bullmq';
import type { JudgeJobData, RunJobData } from './queue';

/** BullMQ processor of the `judge` queue (SUBMISSION incl. REFERENCE, and GENERATE_OUTPUTS). Owner: A2. */
export async function processJudgeJob(job: Job<JudgeJobData>): Promise<void> {
  throw new Error('not implemented: processJudgeJob');
}

/** BullMQ processor of the `run` queue (custom-input runs; result in Redis run:<runId>). Owner: A2. */
export async function processRunJob(job: Job<RunJobData>): Promise<void> {
  throw new Error('not implemented: processRunJob');
}
