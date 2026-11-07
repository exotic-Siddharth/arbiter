import { randomBytes } from 'node:crypto';
import { afterAll } from 'vitest';
import { testDatabaseUrl, testRedisUrl } from './env';

/**
 * Runs before every test file, before the file's own imports, so src/config/env.ts sees these
 * values. Keep this file free of static imports from src/.
 *
 * Every test file gets its own random QUEUE_PREFIX / SOCKET_IO_KEY / RATE_LIMIT_PREFIX, so files
 * (and parallel lanes sharing a Redis DB) never see each other's queues, events or limits.
 */
const tag = `t${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.REDIS_URL = testRedisUrl();
process.env.QUEUE_PREFIX = tag;
process.env.SOCKET_IO_KEY = `${tag}-sio`;
process.env.RATE_LIMIT_PREFIX = `${tag}:rl`;
process.env.RATE_LIMITS_ENABLED = 'true';
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-0123456789abcdef';
process.env.WEB_ORIGIN = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.DEMO_LOGIN_ENABLED = 'true';
process.env.WORKER_METRICS_PORT = '0';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';

afterAll(async () => {
  // Closes the Prisma client, Redis clients, the socket emitter and anything else registered
  // with onShutdown(); dynamic import so nothing from src/ loads before the env above is set.
  const { closeAll } = await import('../src/lib/lifecycle');
  await closeAll();
});
