import type { RequestHandler } from 'express';
import { Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { logger } from './logger';

/**
 * Per-process Prometheus registry with the default Node metrics (R8). The API serves it at
 * GET /metrics; the worker serves its own registry on WORKER_METRICS_PORT. Register new metrics
 * with `registers: [metricsRegistry]` (judge/sandbox metrics live in src/judge/, lane A2).
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/** Collected from BullMQ at scrape time (getQueueCounts() from judge/queue.ts). */
export const judgeQueueWaiting = new Gauge({
  name: 'judge_queue_waiting',
  help: 'Jobs waiting in the judge queue',
  registers: [metricsRegistry],
  async collect() {
    try {
      const { getQueueCounts } = await import('../judge/queue');
      const counts = await getQueueCounts();
      this.set(counts.judge.waiting);
    } catch (error) {
      // A scrape must not fail because the queue is unavailable: keep the previous value.
      logger.debug({ err: (error as Error).message }, 'judge_queue_waiting collect failed');
    }
  },
});

/**
 * Times every request. The route label is the declared route path (set by createRouter's
 * route()), so label cardinality stays bounded; unmatched requests are labelled "unmatched".
 */
export const httpMetrics: RequestHandler = (_req, res, next) => {
  const stop = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = typeof res.locals.routeLabel === 'string' ? res.locals.routeLabel : 'unmatched';
    stop({ route, method: res.req.method, status: String(res.statusCode) });
  });
  next();
};
