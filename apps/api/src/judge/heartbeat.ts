import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';

/**
 * Worker heartbeat (spec section 8.8): Redis key judge:worker:<id> =
 * {id, prefix, startedAt, concurrency, processed, lastSeen}, TTL 15 s, refreshed every 5 s.
 * The admin monitor lists workers from these keys (filtered on QUEUE_PREFIX) and the janitor
 * treats a container whose worker key is gone as stale.
 */
export const HEARTBEAT_TTL_SEC = 15;
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_KEY_PREFIX = 'judge:worker:';

/** This process's worker id (also the arbiter.worker container label). */
export const WORKER_ID = `${hostname()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '-')
  .slice(0, 30)}-${process.pid}-${randomBytes(2).toString('hex')}`;

export const heartbeatKey = (workerId: string) => `${HEARTBEAT_KEY_PREFIX}${workerId}`;

export interface HeartbeatValue {
  id: string;
  prefix: string;
  startedAt: string;
  lastSeen: string;
  concurrency: number;
  processed: number;
}

let processed = 0;

/** Count one finished job (judge or run) for the heartbeat. */
export function recordProcessed(): void {
  processed += 1;
}

export interface Heartbeat {
  /** Write the key now (also done every 5 s). */
  beat(): Promise<void>;
  /** Stop beating and delete the key. */
  stop(): Promise<void>;
}

export function startHeartbeat(options: {
  concurrency: number;
  redis?: Redis;
  workerId?: string;
  intervalMs?: number;
}): Heartbeat {
  const redis = options.redis ?? getRedis();
  const id = options.workerId ?? WORKER_ID;
  const startedAt = new Date().toISOString();
  const beat = async () => {
    const value: HeartbeatValue = {
      id,
      prefix: env.QUEUE_PREFIX,
      startedAt,
      lastSeen: new Date().toISOString(),
      concurrency: options.concurrency,
      processed,
    };
    await redis.set(heartbeatKey(id), JSON.stringify(value), 'EX', HEARTBEAT_TTL_SEC);
  };
  const timer = setInterval(() => {
    beat().catch((error: Error) => logger.warn({ err: error.message }, 'heartbeat failed'));
  }, options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return {
    beat,
    async stop() {
      clearInterval(timer);
      await redis.del(heartbeatKey(id)).catch(() => undefined);
    },
  };
}

/** Heartbeats of live workers sharing this QUEUE_PREFIX. */
export async function listWorkers(redis: Redis = getRedis()): Promise<HeartbeatValue[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(
      cursor,
      'MATCH',
      `${HEARTBEAT_KEY_PREFIX}*`,
      'COUNT',
      200,
    );
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  if (keys.length === 0) return [];
  const values = await redis.mget(...keys);
  const workers: HeartbeatValue[] = [];
  for (const raw of values) {
    if (!raw) continue;
    try {
      const value = JSON.parse(raw) as HeartbeatValue;
      if (value.prefix === env.QUEUE_PREFIX) workers.push(value);
    } catch {
      // ignore a malformed key
    }
  }
  return workers.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
