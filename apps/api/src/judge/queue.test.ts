import { UnrecoverableError, Worker } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { createRedisConnection } from '../lib/redis';
import { JOB_ATTEMPTS, enqueuePlagiarism, enqueueRun, enqueueSubmission, getQueue } from './queue';

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

  it('drops a failed run job as soon as it fails for good, but keeps it between retries (A-R2-07)', async () => {
    // removeOnFail with an age is only applied when a later job fails into the same set, so
    // a lone failed run job would keep the source code and input in Redis indefinitely.
    let attempt = 0;
    const worker = startRunWorker(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('crash, retried');
      throw new UnrecoverableError('crash, final');
    });
    const failures: string[] = [];
    const retried = new Promise<void>((resolve) =>
      worker.on('failed', (_job, error) => {
        failures.push(error.message);
        resolve();
      }),
    );
    const runId = await enqueueRun(RUN);
    await retried;
    // Not final yet: the job (and its data for the retry) must still be there.
    expect(await getQueue('run').getJob(`run-${runId}`)).toBeDefined();
    await expect.poll(() => failures.length, { timeout: 10_000 }).toBe(2);
    await expect
      .poll(async () => getQueue('run').getJob(`run-${runId}`), { timeout: 5000 })
      .toBeUndefined();
    expect(await getQueue('run').getJobCounts('failed')).toEqual({ failed: 0 });
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
