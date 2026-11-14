import { ErrorBodySchema, ReadinessSchema } from '@arbiter/shared';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '../test/db';
import { authHeader, createUser } from '../test/factories';
import { createApp } from './app';
import { signAccessToken } from './lib/jwt';
import { routeManifest } from './lib/router';

/** The literal route list of spec section 10 (every row of both tables, plus the section 10 health routes). */
const SPEC_ROUTES = [
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'GET /api/users/:username',
  'PATCH /api/users/me',
  'GET /api/leaderboard',
  'GET /api/problems',
  'GET /api/problems/:slug',
  'GET /api/tags',
  'POST /api/submissions',
  'GET /api/submissions',
  'GET /api/submissions/:id',
  'POST /api/runs',
  'GET /api/runs/:runId',
  'GET /api/contests',
  'GET /api/contests/:slug',
  'POST /api/contests/:slug/register',
  'GET /api/contests/:slug/problems/:label',
  'GET /api/contests/:slug/scoreboard',
  'GET /api/contests/:slug/submissions',
  'GET /api/stats',
  'GET /api/admin/problems',
  'POST /api/admin/problems',
  'GET /api/admin/problems/:id',
  'PUT /api/admin/problems/:id',
  'DELETE /api/admin/problems/:id',
  'GET /api/admin/problems/:id/tests',
  'POST /api/admin/problems/:id/tests',
  'PUT /api/admin/problems/:id/tests/:testId',
  'DELETE /api/admin/problems/:id/tests/:testId',
  'POST /api/admin/problems/:id/tests/bulk',
  'POST /api/admin/problems/:id/validate-reference',
  'POST /api/admin/problems/:id/generate-outputs',
  'GET /api/admin/jobs/:id',
  'GET /api/admin/contests',
  'POST /api/admin/contests',
  'GET /api/admin/contests/:id',
  'PUT /api/admin/contests/:id',
  'DELETE /api/admin/contests/:id',
  'POST /api/admin/contests/:id/rate',
  'POST /api/admin/plagiarism',
  'GET /api/admin/plagiarism',
  'GET /api/admin/plagiarism/:id',
  'GET /api/admin/judge',
  'GET /api/admin/users',
  'PATCH /api/admin/users/:id',
  'GET /healthz',
  'GET /readyz',
  'GET /metrics',
];

/** Routes the build added beyond section 10 (see the Decisions log). */
const EXTRA_ROUTES = [
  'POST /api/auth/demo',
  'GET /api/admin/problems/:id/tests/:testId',
  'GET /robots.txt',
  'GET /sitemap.xml',
];

const app = createApp();

const userToken = signAccessToken({ id: 'user-1', username: 'alice', role: 'USER' });

describe('createApp', () => {
  it('GET /healthz → 200 {ok:true}', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown route → 404 error shape', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    const body = ErrorBodySchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('/api/definitely-not-a-route');
  });

  it('validation failure → 400 VALIDATION_ERROR with details', async () => {
    const res = await request(app).get('/api/problems').query({ pageSize: '1000' });
    expect(res.status).toBe(400);
    const body = ErrorBodySchema.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ location: 'query', path: 'pageSize' })]),
    );
  });

  it('GET /api/openapi.json → 200 openapi 3.x', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths['/api/problems/{slug}']?.get).toBeDefined();
    expect(res.body.paths['/api/admin/judge']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('requireRole rejects USER with 403', async () => {
    const res = await request(app)
      .get('/api/admin/judge')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('admin routes without a token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/admin/judge');
    expect(res.status).toBe(401);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
  });

  it('an invalid bearer token → 401 even on optional-auth routes', async () => {
    const res = await request(app).get('/api/problems').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
  });

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier": ');
    expect(res.status).toBe(400);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('JSON body over 1 MB → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ identifier: 'x'.repeat(1_100_000), password: 'x' }));
    expect(res.status).toBe(413);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('admin test-case routes skip the 1 MB parser (they allow 20 MB)', async () => {
    // Admin routes re-read the caller's role from the database, so the admin must exist.
    const admin = await createUser(await setupTestDatabase(), { role: 'ADMIN' });
    const big = 'y'.repeat(2_000_000);
    const res = await request(app)
      .post('/api/admin/problems/some-problem-id/tests/bulk')
      .set(authHeader(admin))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ tests: [{ input: big, expectedOutput: '1\n' }], replace: false }));
    expect(res.status).not.toBe(413);
    expect(res.status).not.toBe(400);
  });

  it('a JSON body over 20 MB → 413 PAYLOAD_TOO_LARGE on the bulk and single test routes', async () => {
    const admin = await createUser(await setupTestDatabase(), { role: 'ADMIN' });
    const huge = 'y'.repeat(21_000_000);
    const payloads = [
      ['/api/admin/problems/some-problem-id/tests/bulk', { tests: [{ input: huge }] }],
      ['/api/admin/problems/some-problem-id/tests', { input: huge, expectedOutput: '1\n' }],
    ] as const;
    for (const [path, payload] of payloads) {
      const res = await request(app)
        .post(path)
        .set(authHeader(admin))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payload));
      expect(res.status, path).toBe(413);
      expect(ErrorBodySchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('every admin route in routeManifest is 401 for a guest and 403 for a USER', async () => {
    const user = await createUser(await setupTestDatabase());
    const adminRoutes = routeManifest.filter((r) => r.auth === 'admin');
    expect(adminRoutes.length).toBeGreaterThan(15);
    for (const { method, fullPath } of adminRoutes) {
      const path = fullPath.replace(/:[A-Za-z0-9_]+/g, 'x');
      const label = `${method.toUpperCase()} ${fullPath}`;
      const guest = await request(app)[method](path);
      expect(guest.status, label).toBe(401);
      const asUser = await request(app)[method](path).set(authHeader(user));
      expect(asUser.status, label).toBe(403);
      expect(ErrorBodySchema.parse(asUser.body).error.code).toBe('FORBIDDEN');
    }
  });

  it('GET /readyz → 200 when Postgres and Redis are up', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(ReadinessSchema.parse(res.body)).toEqual({ ok: true, db: 'up', redis: 'up' });
  });

  describe('with an unreachable Redis', () => {
    const deadRedis = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    deadRedis.on('error', () => {});
    afterAll(() => deadRedis.disconnect());

    it('GET /readyz → 503 with redis "down"', async () => {
      const res = await request(createApp({ redis: deadRedis, rateLimits: false })).get('/readyz');
      expect(res.status).toBe(503);
      expect(ReadinessSchema.parse(res.body)).toEqual({ ok: false, db: 'up', redis: 'down' });
    });
  });

  it('GET /metrics serves Prometheus text with the HTTP histogram', async () => {
    await request(app).get('/healthz');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('judge_queue_waiting');
  });

  it('GET /api/docs/ serves Swagger UI', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger');
  });

  it('every routeManifest entry is an operation in the OpenAPI document', async () => {
    const res = await request(app).get('/api/openapi.json');
    const paths = res.body.paths as Record<string, Record<string, unknown>>;
    expect(routeManifest.length).toBeGreaterThan(40);
    for (const { method, fullPath } of routeManifest) {
      const openApiPath = fullPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      expect(paths[openApiPath]?.[method], `${method.toUpperCase()} ${fullPath}`).toBeDefined();
    }
    const unique = new Set(routeManifest.map((r) => `${r.method} ${r.fullPath}`));
    expect(unique.size).toBe(routeManifest.length);
  });

  it('the registered routes are exactly the spec section 10 list plus the documented extras', async () => {
    const registered = routeManifest.map((r) => `${r.method.toUpperCase()} ${r.fullPath}`).sort();
    expect(registered).toEqual([...SPEC_ROUTES, ...EXTRA_ROUTES].sort());
    // Every API route is also an operation in the served OpenAPI document (health and metrics are not).
    const res = await request(app).get('/api/openapi.json');
    const paths = res.body.paths as Record<string, Record<string, unknown>>;
    for (const entry of registered.filter((r) => r.includes(' /api/'))) {
      const [method, path] = entry.split(' ');
      const openApiPath = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      expect(paths[openApiPath]?.[method.toLowerCase()], entry).toBeDefined();
    }
  });
});
