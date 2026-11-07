import { HealthSchema, ReadinessSchema, type Readiness } from '@arbiter/shared';
import { getDeps } from '../../lib/deps';
import { metricsRegistry } from '../../lib/metrics';
import { createRouter } from '../../lib/router';

// Owner: S4 / I1. Root-level probes and metrics (spec section 10, "Health").
const { router, route } = createRouter('');
export { router };

const CHECK_TIMEOUT_MS = 2000;

async function passes(check: () => Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check().then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

route(
  {
    method: 'get',
    path: '/healthz',
    summary: 'Liveness probe',
    tags: ['Health'],
    responses: { 200: HealthSchema },
  },
  (_req, res) => {
    res.json({ ok: true });
  },
);

route(
  {
    method: 'get',
    path: '/readyz',
    summary: 'Readiness probe: Postgres and Redis',
    tags: ['Health'],
    responses: {
      200: ReadinessSchema,
      503: { description: 'Postgres or Redis is down', schema: ReadinessSchema },
    },
  },
  async (req, res) => {
    const { prisma, redis } = getDeps(req);
    const [db, cache] = await Promise.all([
      passes(() => prisma.$queryRaw`SELECT 1`),
      passes(async () => {
        if ((await redis.ping()) !== 'PONG') throw new Error('unexpected PING reply');
      }),
    ]);
    const body: Readiness = {
      ok: db && cache,
      db: db ? 'up' : 'down',
      redis: cache ? 'up' : 'down',
    };
    res.status(body.ok ? 200 : 503).json(body);
  },
);

route(
  {
    method: 'get',
    path: '/metrics',
    summary: 'Prometheus metrics',
    tags: ['Health'],
    responses: { 200: { description: 'Prometheus text exposition format' } },
  },
  async (_req, res) => {
    const body = await metricsRegistry.metrics();
    res.type(metricsRegistry.contentType).send(body);
  },
);
