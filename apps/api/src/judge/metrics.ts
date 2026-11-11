import { Counter, Histogram } from 'prom-client';
import { metricsRegistry } from '../lib/metrics';

/**
 * Judge and sandbox metrics (spec section 16, R8), served by the worker's /metrics on
 * WORKER_METRICS_PORT. judge_queue_waiting lives in lib/metrics.ts (collected at scrape time).
 */
export const judgeJobsTotal = new Counter({
  name: 'judge_jobs_total',
  help: 'Judged submissions by final verdict and language',
  labelNames: ['verdict', 'language'] as const,
  registers: [metricsRegistry],
});

export const judgeJobDuration = new Histogram({
  name: 'judge_job_duration_seconds',
  help: 'Wall time of a judge job, from pickup to the persisted verdict',
  labelNames: ['language'] as const,
  buckets: [0.5, 1, 2, 3, 5, 8, 13, 21, 34, 60, 120],
  registers: [metricsRegistry],
});

export const sandboxContainerStart = new Histogram({
  name: 'sandbox_container_start_seconds',
  help: 'Time from docker run to the harness ready message',
  buckets: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10],
  registers: [metricsRegistry],
});
