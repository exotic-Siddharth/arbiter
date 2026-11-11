import { createServer, type Server } from 'node:http';
import { Worker, type Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { metricsRegistry } from '../lib/metrics';
import { createRedisConnection } from '../lib/redis';
import { runPlagiarismReport } from '../modules/plagiarism/service';
import { failExhaustedJob } from './failure';
import { processJudgeJob, processRunJob } from './processor';
import {
  QUEUE_NAMES,
  type JudgeJobData,
  type PlagiarismJobData,
  type QueueName,
  type RunJobData,
} from './queue';

/**
 * Worker wiring of the `judge`, `run` and `plagiarism` queues and the worker's /metrics server
 * (spec 8.8, R8), split out of worker.ts so it can be tested with injected processors.
 */
const log = logger.child({ proc: 'worker' });

export interface Processors {
  judge: (job: Job<JudgeJobData>) => Promise<unknown>;
  run: (job: Job<RunJobData>) => Promise<unknown>;
  plagiarism: (job: Job<PlagiarismJobData>) => Promise<unknown>;
}

const defaultProcessors: Processors = {
  judge: (job) => processJudgeJob(job),
  run: (job) => processRunJob(job),
  plagiarism: (job) => runPlagiarismReport(job.data.reportId),
};

/** One BullMQ Worker per queue; a job that BullMQ gives up on ends its row FAILED/IE (A-06). */
export function createWorkers(processors: Processors = defaultProcessors): Worker[] {
  const options = (concurrency: number) => ({
    connection: createRedisConnection(),
    prefix: env.QUEUE_PREFIX,
    concurrency,
  });
  const workers: [QueueName, Worker][] = [
    [
      'judge',
      new Worker<JudgeJobData>(QUEUE_NAMES.judge, processors.judge, options(env.JUDGE_CONCURRENCY)),
    ],
    ['run', new Worker<RunJobData>(QUEUE_NAMES.run, processors.run, options(env.RUN_CONCURRENCY))],
    [
      'plagiarism',
      new Worker<PlagiarismJobData>(QUEUE_NAMES.plagiarism, processors.plagiarism, options(1)),
    ],
  ];
  for (const [queue, worker] of workers) {
    worker.on('failed', (job, error) => {
      log.warn(
        { queue: worker.name, jobId: job?.id, attempt: job?.attemptsMade, err: error.message },
        'job failed',
      );
      void failExhaustedJob(queue, job, error);
    });
    worker.on('error', (error) => {
      log.error({ queue: worker.name, err: error.message }, 'worker error');
    });
  }
  return workers.map(([, worker]) => worker);
}

/** GET /metrics of the worker process (prom-client registry); listens on `port` (0 = any). */
export function startMetricsServer(port: number, onListening?: () => void): Server {
  const server = createServer((req, res) => {
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
  server.listen(port, onListening);
  return server;
}
