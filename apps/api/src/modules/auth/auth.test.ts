import { AuthResponseSchema, ErrorBodySchema, MeResponseSchema } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { verifyAccessToken } from '../../lib/jwt';
import { TEST_PASSWORD, authHeader, createUser, uniqueSuffix } from '../../../test/factories';
import { setupTestDatabase } from '../../../test/db';
import { hashToken, rotateRefreshToken } from './tokens';

let prisma: PrismaClient;
// Rate limits off here; the limiter tests build their own app below.
const app = createApp({ rateLimits: false });

beforeAll(async () => {
  prisma = await setupTestDatabase();
});

/** The raw arb_rt value from a response, or undefined; also returns the full Set-Cookie line. */
function refreshCookie(res: request.Response): { value: string; line: string } | undefined {
  const lines = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const line = lines.find((entry) => entry.startsWith('arb_rt='));
  if (!line) return undefined;
  return { value: line.split(';')[0].slice('arb_rt='.length), line };
}

const unique = () => uniqueSuffix();

async function register(
  overrides: Partial<{ email: string; username: string; password: string }> = {},
) {
  const suffix = unique();
  const body = {
    email: `new_${suffix}@example.test`,
    username: `new_${suffix}`,
    password: TEST_PASSWORD,
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body };
}

describe('POST /api/auth/register', () => {
  it('creates the account: 201, Me + access token, httpOnly arb_rt cookie, hashed password', async () => {
    const { res, body } = await register();
    expect(res.status).toBe(201);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.user.username).toBe(body.username);
    expect(parsed.user.email).toBe(body.email);
    expect(parsed.user.role).toBe('USER');
    expect(parsed.user.rating).toBe(1200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(verifyAccessToken(parsed.accessToken).sub).toBe(parsed.user.id);

    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie?.line).toMatch(/HttpOnly/i);
    expect(cookie?.line).toMatch(/SameSite=Strict/i);
    expect(cookie?.line).toMatch(/Path=\/api\/auth(;|$)/);
    expect(cookie?.line).not.toMatch(/;\s*Secure/i); // COOKIE_SECURE=false in tests
    expect(cookie?.line).toMatch(/Max-Age=\d+/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: parsed.user.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(body.password);
    expect(stored.usernameLower).toBe(body.username.toLowerCase());
    // The refresh token is stored only as its hash.
    const tokens = await prisma.refreshToken.findMany({ where: { userId: parsed.user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(cookie?.value ?? ''));
    expect(tokens[0].tokenHash).not.toBe(cookie?.value);
  });

  it('stores the email lower-case', async () => {
    const suffix = unique();
    const { res } = await register({
      email: `MiXeD_${suffix}@Example.TEST`,
      username: `mix_${suffix}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(`mixed_${suffix}@example.test`);
  });

  it('duplicate email → 409, case-insensitive', async () => {
    const first = await register();
    const suffix = unique();
    const { res } = await register({
      email: first.body.email.toUpperCase(),
      username: `other_${suffix}`,
    });
    expect(res.status).toBe(409);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('CONFLICT');
  });

  it('duplicate username → 409, case-insensitive', async () => {
    const first = await register();
    const suffix = unique();
    const { res } = await register({
      username: first.body.username.toUpperCase(),
      email: `other_${suffix}@example.test`,
    });
    expect(res.status).toBe(409);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('CONFLICT');
  });

  it('rejects a short password and a bad username with 400', async () => {
    const short = await register({ password: 'short' });
    expect(short.res.status).toBe(400);
    const bad = await register({ username: 'no spaces!' });
    expect(bad.res.status).toBe(400);
    expect(ErrorBodySchema.parse(bad.res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in by username (any case) and by email', async () => {
    const user = await createUser(prisma, { username: `Login_${unique()}` });
    const byName = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username.toUpperCase(), password: TEST_PASSWORD });
    expect(byName.status).toBe(200);
    expect(AuthResponseSchema.parse(byName.body).user.id).toBe(user.id);
    expect(refreshCookie(byName)).toBeDefined();

    const byEmail = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email.toUpperCase(), password: TEST_PASSWORD });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.user.id).toBe(user.id);
  });

  it('wrong password and unknown user give the same generic 401', async () => {
    const user = await createUser(prisma);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: 'definitely-wrong' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `nobody_${unique()}`, password: 'definitely-wrong' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(ErrorBodySchema.parse(wrong.body).error.code).toBe('UNAUTHORIZED');
    expect(refreshCookie(wrong)).toBeUndefined();
  });

  it('spends comparable time on an unknown user (dummy hash verification)', async () => {
    const user = await createUser(prisma);
    const timeIt = async (identifier: string) => {
      const start = performance.now();
      await request(app).post('/api/auth/login').send({ identifier, password: 'definitely-wrong' });
      return performance.now() - start;
    };
    await timeIt(user.username); // warm up
    const known = await timeIt(user.username);
    const unknown = await timeIt(`ghost_${unique()}`);
    // An unknown user must not be answered immediately: Argon2 verify takes tens of ms.
    expect(unknown).toBeGreaterThan(known * 0.4);
  });
});

describe('refresh rotation', () => {
  async function login() {
    const user = await createUser(prisma);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return { user, token: refreshCookie(res)?.value ?? '' };
  }

  it('POST /refresh rotates the cookie and returns a fresh access token', async () => {
    const { user, token } = await login();
    const res = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${token}`);
    expect(res.status).toBe(200);
    const parsed = AuthResponseSchema.parse(res.body);
    expect(parsed.user.id).toBe(user.id);
    expect(verifyAccessToken(parsed.accessToken).username).toBe(user.username);
    const next = refreshCookie(res);
    expect(next?.value).toBeTruthy();
    expect(next?.value).not.toBe(token);
    expect(next?.line).toMatch(/HttpOnly/i);

    const records = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(2);
    expect(new Set(records.map((r) => r.familyId)).size).toBe(1);
    const old = records.find((r) => r.tokenHash === hashToken(token));
    expect(old?.revokedAt).not.toBeNull();
    expect(old?.replacedById).toBe(records.find((r) => r.id !== old?.id)?.id);
  });

  it('reusing an old refresh token → 401 and the whole family is revoked', async () => {
    const { user, token: first } = await login();
    const second = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${first}`);
    const newest = refreshCookie(second)?.value ?? '';
    expect(second.status).toBe(200);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${first}`);
    expect(replay.status).toBe(401);
    expect(ErrorBodySchema.parse(replay.body).error.code).toBe('UNAUTHORIZED');

    // A later refresh with the newest token fails too: the family is dead.
    const later = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${newest}`);
    expect(later.status).toBe(401);
    const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(live).toBe(0);
  });

  it('reuse detection does not touch another login session of the same user', async () => {
    const { user, token: first } = await login();
    const other = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: TEST_PASSWORD });
    const otherToken = refreshCookie(other)?.value ?? '';
    await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${first}`);
    await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${first}`); // replay
    const ok = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${otherToken}`);
    expect(ok.status).toBe(200);
  });

  it('a missing, malformed or unknown cookie → 401', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
    const unknown = await request(app).post('/api/auth/refresh').set('Cookie', 'arb_rt=nonsense');
    expect(unknown.status).toBe(401);
  });

  it('an expired token → 401', async () => {
    const { user, token } = await login();
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${token}`);
    expect(res.status).toBe(401);
  });

  it('concurrent rotation of the same token lets exactly one caller win', async () => {
    const { user, token } = await login();
    const results = await Promise.allSettled([
      rotateRefreshToken(prisma, token, {}),
      rotateRefreshToken(prisma, token, {}),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // The loser is treated as reuse: the family is revoked.
    const live = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(live).toBe(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the family and clears the cookie', async () => {
    const user = await createUser(prisma);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.username, password: TEST_PASSWORD });
    const token = refreshCookie(loginRes)?.value ?? '';

    const res = await request(app).post('/api/auth/logout').set('Cookie', `arb_rt=${token}`);
    expect(res.status).toBe(204);
    const cleared = refreshCookie(res);
    expect(cleared?.line).toMatch(/arb_rt=;/);
    expect(cleared?.line).toMatch(/Path=\/api\/auth/);
    expect(cleared?.line).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const after = await request(app).post('/api/auth/refresh').set('Cookie', `arb_rt=${token}`);
    expect(after.status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('is idempotent without a cookie: 204 and the cookie is cleared', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(refreshCookie(res)?.line).toMatch(/arb_rt=;/);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the signed-in user', async () => {
    const user = await createUser(prisma, { bio: 'hello' });
    const res = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(res.status).toBe(200);
    const parsed = MeResponseSchema.parse(res.body);
    expect(parsed.user).toMatchObject({ id: user.id, username: user.username, bio: 'hello' });
  });

  it('401 without a token, and 401 when the account no longer exists', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const ghost = { id: 'does-not-exist', username: 'ghost', role: 'USER' as const };
    expect((await request(app).get('/api/auth/me').set(authHeader(ghost))).status).toBe(401);
  });
});

describe('rate limits', () => {
  it('the login limiter trips at the 11th attempt (10 per 15 min per IP + identifier)', async () => {
    const limited = createApp({ rateLimits: { login: true, register: false, api: false } });
    const identifier = `limit_${unique()}`;
    for (let i = 1; i <= 10; i += 1) {
      const res = await request(limited)
        .post('/api/auth/login')
        .send({ identifier, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(limited)
      .post('/api/auth/login')
      .send({ identifier, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(ErrorBodySchema.parse(blocked.body).error.code).toBe('RATE_LIMITED');
    // A different identifier has its own bucket.
    const other = await request(limited)
      .post('/api/auth/login')
      .send({ identifier: `${identifier}_2`, password: 'wrong-password' });
    expect(other.status).toBe(401);
  });

  it('registration is limited to 5 per hour per IP', async () => {
    const limited = createApp({ rateLimits: { register: true, login: false, api: false } });
    const attempt = () => {
      const suffix = unique();
      return request(limited)
        .post('/api/auth/register')
        .send({
          email: `rl_${suffix}@example.test`,
          username: `rl_${suffix}`,
          password: TEST_PASSWORD,
        });
    };
    for (let i = 1; i <= 5; i += 1) expect((await attempt()).status).toBe(201);
    expect((await attempt()).status).toBe(429);
  });
});

describe('POST /api/auth/demo', () => {
  const demoApp = () => createApp({ rateLimits: false });

  it('logs in as the demo user: 200 + cookie, same shape as login', async () => {
    await prisma.user.deleteMany({ where: { usernameLower: 'demo' } });
    const demo = await createUser(prisma, { username: 'demo', email: 'demo@example.test' });
    const res = await request(demoApp()).post('/api/auth/demo');
    expect(res.status).toBe(200);
    expect(AuthResponseSchema.parse(res.body).user.id).toBe(demo.id);
    expect(refreshCookie(res)?.line).toMatch(/HttpOnly/i);
    const refreshed = await request(demoApp())
      .post('/api/auth/refresh')
      .set('Cookie', `arb_rt=${refreshCookie(res)?.value}`);
    expect(refreshed.status).toBe(200);
  });

  it('404 when DEMO_LOGIN_ENABLED is false', async () => {
    const previous = env.DEMO_LOGIN_ENABLED;
    env.DEMO_LOGIN_ENABLED = false;
    try {
      const res = await request(demoApp()).post('/api/auth/demo');
      expect(res.status).toBe(404);
      expect(ErrorBodySchema.parse(res.body).error.code).toBe('NOT_FOUND');
      expect(refreshCookie(res)).toBeUndefined();
    } finally {
      env.DEMO_LOGIN_ENABLED = previous;
    }
  });

  it('404 when the demo user does not exist', async () => {
    await prisma.user.deleteMany({ where: { usernameLower: 'demo' } });
    const res = await request(demoApp()).post('/api/auth/demo');
    expect(res.status).toBe(404);
  });

  it('the login limiter applies (11th call → 429)', async () => {
    await prisma.user.deleteMany({ where: { usernameLower: 'demo' } });
    await createUser(prisma, { username: 'demo', email: 'demo@example.test' });
    const limited = createApp({ rateLimits: { login: true, register: false, api: false } });
    for (let i = 1; i <= 10; i += 1) {
      expect((await request(limited).post('/api/auth/demo')).status).toBe(200);
    }
    const blocked = await request(limited).post('/api/auth/demo');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
