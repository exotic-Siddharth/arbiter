import type { JudgeStatus } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { prisma as defaultPrisma } from '../db/prisma';
import { MINUTE_MS } from '../lib/time';
import { listWorkers } from './heartbeat';
import { getQueueCounts } from './queue';

const WINDOW_MINUTES = 30;
const LATENCY_SAMPLE = 200;

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

/** Per-minute counts for the last `minutes` minutes, oldest first (minute = ISO start). */
export function bucketPerMinute(
  times: Date[],
  now: number,
  minutes = WINDOW_MINUTES,
): JudgeStatus['throughputPerMin'] {
  const currentMinute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const first = currentMinute - (minutes - 1) * MINUTE_MS;
  const counts = new Array<number>(minutes).fill(0);
  for (const time of times) {
    const index = Math.floor((time.getTime() - first) / MINUTE_MS);
    if (index >= 0 && index < minutes) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((count, index) => ({
    minute: new Date(first + index * MINUTE_MS).toISOString(),
    count,
  }));
}

/**
 * GET /api/admin/judge: queue counts (BullMQ), live workers (heartbeats), queue-to-verdict
 * latency over the last 200 judged submissions, and judged submissions per minute (30 min).
 */
export async function getJudgeStatus(
  deps: { prisma?: PrismaClient; redis?: Redis; now?: number } = {},
): Promise<JudgeStatus> {
  const prisma = deps.prisma ?? defaultPrisma;
  const now = deps.now ?? Date.now();
  const since = new Date(
    Math.floor(now / MINUTE_MS) * MINUTE_MS - (WINDOW_MINUTES - 1) * MINUTE_MS,
  );
  const [queues, workers, recent, window] = await Promise.all([
    getQueueCounts(),
    listWorkers(deps.redis),
    prisma.submission.findMany({
      where: { judgedAt: { not: null } },
      orderBy: { judgedAt: 'desc' },
      take: LATENCY_SAMPLE,
      select: { createdAt: true, judgedAt: true },
    }),
    prisma.submission.findMany({
      where: { judgedAt: { gte: since } },
      select: { judgedAt: true },
    }),
  ]);
  const latencies = recent
    .map((s) => (s.judgedAt ? s.judgedAt.getTime() - s.createdAt.getTime() : 0))
    .map((ms) => Math.max(0, ms))
    .sort((a, b) => a - b);
  return {
    queues,
    workers: workers.map(({ id, startedAt, lastSeen, concurrency, processed }) => ({
      id,
      startedAt,
      lastSeen,
      concurrency,
      processed,
    })),
    latency: {
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      sample: latencies.length,
    },
    throughputPerMin: bucketPerMinute(
      window.flatMap((s) => (s.judgedAt ? [s.judgedAt] : [])),
      now,
    ),
  };
}
