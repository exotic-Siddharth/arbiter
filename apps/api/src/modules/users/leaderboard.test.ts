import { ErrorBodySchema, LeaderboardPageSchema } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { resetTables, setupTestDatabase } from '../../../test/db';
import { createProblem, createSubmission, createUser } from '../../../test/factories';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

const get = async (query: Record<string, string | number> = {}) => {
  const res = await request(app).get('/api/leaderboard').query(query);
  expect(res.status).toBe(200);
  return LeaderboardPageSchema.parse(res.body);
};

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

describe('GET /api/leaderboard by rating', () => {
  it('orders by rating, ties share a rank, the next rank skips', async () => {
    const [a, b, c, d, e] = await Promise.all(
      [
        ['lb_alice', 1800],
        ['lb_bob', 1500],
        ['lb_carol', 1500],
        ['lb_dave', 1500],
        ['lb_erin', 1100],
      ].map(([username, rating]) =>
        createUser(prisma, { username: username as string, rating: rating as number }),
      ),
    );
    void [a, b, c, d, e];
    const page = await get({ by: 'rating' });
    expect(page.total).toBe(5);
    expect(page.page).toBe(1);
    expect(page.items.map((r) => [r.username, r.rank, r.rating])).toEqual([
      ['lb_alice', 1, 1800],
      ['lb_bob', 2, 1500],
      ['lb_carol', 2, 1500],
      ['lb_dave', 2, 1500],
      ['lb_erin', 5, 1100],
    ]);
  });

  it('defaults to by=rating and pages with a consistent rank across pages', async () => {
    const dflt = await get();
    expect(dflt.items[0].username).toBe('lb_alice');
    const second = await get({ by: 'rating', page: 2, pageSize: 2 });
    expect(second.pageSize).toBe(2);
    expect(second.total).toBe(5);
    expect(second.items.map((r) => [r.username, r.rank])).toEqual([
      ['lb_carol', 2],
      ['lb_dave', 2],
    ]);
  });

  it('rejects an invalid by and an oversized pageSize with 400', async () => {
    const bad = await request(app).get('/api/leaderboard').query({ by: 'speed' });
    expect(bad.status).toBe(400);
    expect(ErrorBodySchema.parse(bad.body).error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).get('/api/leaderboard').query({ pageSize: 101 })).status).toBe(400);
  });

  it('answers 400, not 500, to an absurd ?page on the public list endpoints (A-25)', async () => {
    for (const path of ['/api/leaderboard', '/api/problems', '/api/submissions']) {
      for (const page of ['1e21', '1e300', '99999999999']) {
        const res = await request(app).get(path).query({ page, pageSize: 100 });
        expect(res.status, `${path}?page=${page}`).toBe(400);
        expect(ErrorBodySchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
      }
    }
  });
});

describe('GET /api/leaderboard by solved', () => {
  it('counts distinct AC problems (NORMAL only), ties share a rank, rating breaks display ties', async () => {
    const p1 = await createProblem(prisma);
    const p2 = await createProblem(prisma);
    const p3 = await createProblem(prisma);
    const ac = (userId: string, problemId: string, extra: object = {}) =>
      createSubmission(prisma, { userId, problemId, status: 'DONE', verdict: 'AC', ...extra });
    const user = (name: string) =>
      prisma.user.findUniqueOrThrow({ where: { usernameLower: name } });

    const alice = await user('lb_alice');
    const bob = await user('lb_bob');
    const carol = await user('lb_carol');
    const dave = await user('lb_dave');

    // alice: p1 twice + p2 -> 2 distinct; bob: p1, p2, p3 -> 3; carol: p1 + p2 -> 2;
    // dave: WA only, plus a REFERENCE AC that must not count -> 0.
    await ac(alice.id, p1.id);
    await ac(alice.id, p1.id);
    await ac(alice.id, p2.id);
    await ac(bob.id, p1.id);
    await ac(bob.id, p2.id);
    await ac(bob.id, p3.id);
    await ac(carol.id, p1.id);
    await ac(carol.id, p2.id);
    await createSubmission(prisma, {
      userId: dave.id,
      problemId: p1.id,
      status: 'DONE',
      verdict: 'WA',
    });
    await ac(dave.id, p3.id, { kind: 'REFERENCE' });

    const page = await get({ by: 'solved' });
    expect(page.items.map((r) => [r.username, r.rank, r.solved])).toEqual([
      ['lb_bob', 1, 3],
      ['lb_alice', 2, 2], // alice (1800) before carol (1500): same rank, higher rating first
      ['lb_carol', 2, 2],
      ['lb_dave', 4, 0],
      ['lb_erin', 4, 0],
    ]);
    // The rating view reports the same solved counts.
    const byRating = await get({ by: 'rating' });
    expect(Object.fromEntries(byRating.items.map((r) => [r.username, r.solved]))).toEqual({
      lb_alice: 2,
      lb_bob: 3,
      lb_carol: 2,
      lb_dave: 0,
      lb_erin: 0,
    });
  });
});
