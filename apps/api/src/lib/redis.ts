import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { onShutdown } from './lifecycle';
import { logger } from './logger';

let connectionCount = 0;

function watchErrors(client: Redis, name: string): Redis {
  client.on('error', (error: Error) => {
    logger.warn({ err: error.message, client: name }, 'redis connection error');
  });
  return client;
}

/**
 * A NEW Redis connection for BullMQ Queue / Worker / QueueEvents and other long-lived
 * subscribers (R17): maxRetriesPerRequest null, no keyPrefix. Never hand the shared client
 * from getRedis() to BullMQ. The caller owns the connection; it is also closed by closeAll().
 */
export function createRedisConnection(options: RedisOptions = {}): Redis {
  const name = `redis-connection-${++connectionCount}`;
  const client = watchErrors(
    new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, ...options }),
    name,
  );
  onShutdown(name, () => client.quit().catch(() => client.disconnect()));
  return client;
}

let shared: Redis | undefined;

/**
 * The shared client for request-path work: rate limits, the scoreboard cache, run results,
 * heartbeats. Created lazily on first use.
 */
export function getRedis(): Redis {
  if (!shared) {
    const client = watchErrors(new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 }), 'shared');
    shared = client;
    onShutdown('redis-shared', closeRedis);
  }
  return shared;
}

/** Close the shared client (no-op if it was never created). */
export async function closeRedis(): Promise<void> {
  const client = shared;
  shared = undefined;
  if (client) await client.quit().catch(() => client.disconnect());
}
