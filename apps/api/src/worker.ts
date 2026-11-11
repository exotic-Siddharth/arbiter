import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Worker } from 'bullmq';
import { env } from './config/env';
import { WORKER_ID, startHeartbeat } from './judge/heartbeat';
import { removeStaleSandboxes } from './judge/janitor';
import { processJudgeJob, processRunJob } from './judge/processor';
import {
  QUEUE_NAMES,
  type JudgeJobData,
  type PlagiarismJobData,
  type RunJobData,
} from './judge/queue';
import { closeAll } from './lib/lifecycle';
import { logger } from './lib/logger';
import { metricsRegistry } from './lib/metrics';
import { createRedisConnection } from './lib/redis';
import { runPlagiarismReport } from './modules/plagiarism/service';

/**
 * Worker process: BullMQ consumers for `judge`, `run` and `plagiarism` (spec section 8.8), its
 * own /metrics on WORKER_METRICS_PORT (R8), the heartbeat (judge:worker:<id>) and the janitor
 * that removes sandbox containers left over by crashed workers (R17). Owner: lane A2.
 */
const log = logger.child({ proc: 'worker', workerId: WORKER_ID });

const JANITOR_INTERVAL_MS = 60_000;

const heartbeat = startHeartbeat({ concurrency: env.JUDGE_CONCURRENCY + env.RUN_CONCURRENCY });

async function sweep(): Promise<void> {
  try {
    await removeStaleSandboxes();
  } catch (error) {
    log.warn({ err: (error as Error).message }, 'janitor failed');
  }
}

// The heartbeat is written first, so the startup janitor never treats our own containers
// as orphans; then stale containers of crashed workers (same QUEUE_PREFIX) are removed.
await heartbeat
  .beat()
  .catch((error: Error) => log.warn({ err: error.message }, 'heartbeat failed'));
await sweep();
const janitorTimer = setInterval(() => void sweep(), JANITOR_INTERVAL_MS);
janitorTimer.unref();

const workerOptions = (concurrency: number) => ({
  connection: createRedisConnection(),
  prefix: env.QUEUE_PREFIX,
  concurrency,
});

const workers = [
  new Worker<JudgeJobData>(
    QUEUE_NAMES.judge,
    (job) => processJudgeJob(job),
    workerOptions(env.JUDGE_CONCURRENCY),
  ),
  new Worker<RunJobData>(
    QUEUE_NAMES.run,
    (job) => processRunJob(job),
    workerOptions(env.RUN_CONCURRENCY),
  ),
  new Worker<PlagiarismJobData>(
    QUEUE_NAMES.plagiarism,
    (job) => runPlagiarismReport(job.data.reportId),
    workerOptions(1),
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => {
    log.warn(
      { queue: worker.name, jobId: job?.id, attempt: job?.attemptsMade, err: error.message },
      'job failed',
    );
  });
  worker.on('error', (error) => {
    log.error({ queue: worker.name, err: error.message }, 'worker error');
  });
}

const metricsServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    metricsRegistry
      .metrics()
      .then((body) => {
        res.writeHead(200, { 'Content-Type': metricsRegistry.contentType }).end(body);
      })
      .catch((error: unknown) => {
        log.error({ err: (error as Error).message }, 'metrics collection failed');
        res.writeHead(500).end();
      });
    return;
  }
  res.writeHead(404).end();
});

metricsServer.listen(env.WORKER_METRICS_PORT, () => {
  const { port } = metricsServer.address() as AddressInfo;
  log.info(
    { queues: Object.values(QUEUE_NAMES), prefix: env.QUEUE_PREFIX, metricsPort: port },
    'worker started',
  );
});

let shuttingDown = false;

/** worker.close() lets in-flight jobs finish, capped at 30 s (spec section 16). */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'worker shutting down');
  clearInterval(janitorTimer);
  const cap = new Promise<void>((resolve) => setTimeout(resolve, 30_000).unref());
  await Promise.race([Promise.allSettled(workers.map((worker) => worker.close())), cap]);
  await heartbeat.stop();
  await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
  await closeAll();
  process.exit(0);
}

// Windows never delivers SIGTERM (R14): handle SIGINT too.
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
