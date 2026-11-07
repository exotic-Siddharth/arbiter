import { ErrorBodySchema, RateLimitedDetailsSchema } from '@arbiter/shared';
import express from 'express';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/error';
import type { RateLimitsConfig } from './rateLimit';
import { isLimiterEnabled, rateLimit } from './rateLimit';
import { getRedis } from './redis';

function appWith(options: { limit: number; rateLimits?: RateLimitsConfig; redis?: Redis }) {
  const app = express();
  app.locals.redis = options.redis ?? getRedis();
  app.locals.rateLimits = options.rateLimits ?? true;
  const limiter = rateLimit({
    name: 'submissions',
    windowMs: 60_000,
    limit: options.limit,
    key: (req) => String(req.query.who ?? 'anon'),
  });
  app.get('/limited', limiter, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('rateLimit', () => {
  it('answers 429 RATE_LIMITED with Retry-After once the limit is used up', async () => {
    const app = appWith({ limit: 2 });
    const key = `ada-${Date.now()}`;
    expect((await request(app).get('/limited').query({ who: key })).status).toBe(200);
    expect((await request(app).get('/limited').query({ who: key })).status).toBe(200);

    const blocked = await request(app).get('/limited').query({ who: key });
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = ErrorBodySchema.parse(blocked.body);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(RateLimitedDetailsSchema.parse(body.error.details).retryAfterSec).toBe(retryAfter);
  });

  it('keeps a separate bucket per key', async () => {
    const app = appWith({ limit: 1 });
    const stamp = Date.now();
    expect(
      (
        await request(app)
          .get('/limited')
          .query({ who: `a-${stamp}` })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/limited')
          .query({ who: `a-${stamp}` })
      ).status,
    ).toBe(429);
    expect(
      (
        await request(app)
          .get('/limited')
          .query({ who: `b-${stamp}` })
      ).status,
    ).toBe(200);
  });

  it('passes through when limits are disabled for the app or for that limiter', async () => {
    for (const rateLimits of [false, { submissions: false }] as const) {
      const app = appWith({ limit: 1, rateLimits });
      const key = `off-${Date.now()}`;
      for (let i = 0; i < 3; i++) {
        expect((await request(app).get('/limited').query({ who: key })).status).toBe(200);
      }
    }
  });

  it('isLimiterEnabled reads booleans and per-limiter maps', () => {
    expect(isLimiterEnabled(true, 'login')).toBe(true);
    expect(isLimiterEnabled(false, 'login')).toBe(false);
    expect(isLimiterEnabled({ login: false }, 'login')).toBe(false);
    expect(isLimiterEnabled({ login: false }, 'runs')).toBe(true);
  });

  describe('with Redis down', () => {
    const deadRedis = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    deadRedis.on('error', () => {});
    afterAll(() => deadRedis.disconnect());

    it('fails the request with 500 instead of crashing on an unhandled rejection', async () => {
      const app = appWith({ limit: 5, redis: deadRedis });
      const res = await request(app).get('/limited').query({ who: 'x' });
      expect(res.status).toBe(500);
      expect(ErrorBodySchema.parse(res.body).error.code).toBe('INTERNAL');
      // Give the store's eager SCRIPT LOAD promises time to settle inside this test.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });
});
