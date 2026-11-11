import { Worker } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { createRedisConnection } from '../lib/redis';
import {
  JOB_ATTEMPTS,
  RUN_TTL_SEC,
  enqueuePlagiarism,
  enqueueRun,
  enqueueSubmission,
  getQueue,
} from './queue';

/** Queue options against a real Redis (random QUEUE_PREFIX per file, see test/setup.ts). */

const workers: Worker[] = [];

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.close()));
});

function startRunWorker(processor: () => Promise<void>): Worker {
  const worker = new Worker('run', processor, {
    connection: createRedisConnection(),
    prefix: env.QUEUE_PREFIX,
  });
  workers.push(worker);
  return worker;
}

const RUN = {
  userId: 'u1',
  language: 'PYTHON' as const,
  sourceCode: 'print(1)',
  input: '',
  timeLimitMs: 1000,
  memoryLimitMb: 256,
};

describe('run queue retention (A-24)', () => {
  it('drops the run job (source code and input) as soon as it completes', async () => {
    const worker = startRunWorker(async () => undefined);
    const done = new Promise<void>((resolve) => worker.once('completed', () => resolve()));
    const runId = await enqueueRun(RUN);
    await done;
    // BullMQ removes the job right after the 'completed' event is emitted.
    await expect
      .poll(async () => getQueue('run').getJob(`run-${runId}`), { timeout: 5000 })
      .toBeUndefined();
  });

  it('keeps a failed run job no longer than the 10-minute result TTL', async () => {
    const runId = await enqueueRun(RUN);
    const job = await getQueue('run').getJob(`run-${runId}`);
    const removeOnFail = job?.opts.removeOnFail as { age?: number } | undefined;
    expect(removeOnFail?.age).toBeLessThanOrEqual(RUN_TTL_SEC);
  });

  it('keeps a bounded age on the judge and plagiarism queues too', async () => {
    await enqueueSubmission('s-retention');
    await enqueuePlagiarism('p-retention');
    for (const [queue, id] of [
      ['judge', 'sub-s-retention'],
      ['plagiarism', 'plag-p-retention'],
    ] as const) {
      const job = await getQueue(queue).getJob(id);
      const opts = job?.opts;
      expect((opts?.removeOnComplete as { age?: number }).age).toBeGreaterThan(0);
      expect((opts?.removeOnFail as { age?: number }).age).toBeGreaterThan(0);
      expect(opts?.attempts).toBe(JOB_ATTEMPTS);
    }
  });
});
