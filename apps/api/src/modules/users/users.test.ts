import { ErrorBodySchema, MeResponseSchema, ProfileSchema } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { addDays, clock } from '../../lib/time';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
  uniqueSuffix,
} from '../../../test/factories';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /api/users/me', () => {
  it('sets the bio and returns Me', async () => {
    const user = await createUser(prisma);
    const res = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: '  Competitive programmer.  ' });
    expect(res.status).toBe(200);
    expect(MeResponseSchema.parse(res.body).user.bio).toBe('Competitive programmer.');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).bio).toBe(
      'Competitive programmer.',
    );
  });

  it('refuses to change the shared demo account profile: 403 and the bio stays', async () => {
    await prisma.user.deleteMany({ where: { usernameLower: 'demo' } });
    const demo = await createUser(prisma, {
      username: 'demo',
      email: 'demo@example.test',
      bio: 'Try Arbiter',
    });
    const res = await request(app)
      .patch('/api/users/me')
      .set(authHeader(demo))
      .send({ bio: 'defaced' });
    expect(res.status).toBe(403);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: demo.id } })).bio).toBe(
      'Try Arbiter',
    );
    await prisma.user.delete({ where: { id: demo.id } });
  });

  it('accepts exactly 280 characters and rejects 281', async () => {
    const user = await createUser(prisma);
    const ok = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: 'x'.repeat(280) });
    expect(ok.status).toBe(200);
    const tooLong = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: 'x'.repeat(281) });
    expect(tooLong.status).toBe(400);
    expect(ErrorBodySchema.parse(tooLong.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('null and an empty string clear the bio', async () => {
    const user = await createUser(prisma, { bio: 'old' });
    const cleared = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.bio).toBeNull();
    await prisma.user.update({ where: { id: user.id }, data: { bio: 'again' } });
    const nulled = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: null });
    expect(nulled.body.user.bio).toBeNull();
  });

  it('requires authentication', async () => {
    const res = await request(app).patch('/api/users/me').send({ bio: 'hi' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/:username', () => {
  it('404 for an unknown user', async () => {
    const res = await request(app).get(`/api/users/nobody_${uniqueSuffix()}`);
    expect(res.status).toBe(404);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('an empty profile: zeros, a 365-entry heatmap, no history', async () => {
    const user = await createUser(prisma);
    const res = await request(app).get(`/api/users/${user.username.toUpperCase()}`);
    expect(res.status).toBe(200);
    const profile = ProfileSchema.parse(res.body);
    expect(profile.user.username).toBe(user.username);
    expect(profile.stats.solved).toEqual({ EASY: 0, MEDIUM: 0, HARD: 0, total: 0 });
    expect(profile.stats.submissions).toBe(0);
    expect(profile.stats.accepted).toBe(0);
    expect(profile.stats.acceptanceRate).toBe(0);
    expect(profile.stats.languages).toEqual([]);
    expect(profile.heatmap).toHaveLength(365);
    expect(profile.heatmap.every((day) => day.count === 0)).toBe(true);
    expect(profile.ratingHistory).toEqual([]);
    expect(profile.recentAccepted).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash/);
  });

  it('computes stats, heatmap, languages, rating history and recent accepted (NORMAL only)', async () => {
    const user = await createUser(prisma, { rating: 1337, bio: 'bio' });
    const easy = await createProblem(prisma, { difficulty: 'EASY' });
    const medium = await createProblem(prisma, { difficulty: 'MEDIUM' });
    const hard = await createProblem(prisma, { difficulty: 'HARD' });
    const hidden = await createProblem(prisma, { difficulty: 'HARD', isPublished: false });
    // Pinned mid-day UTC with explicit timestamps: a run crossing 00:00 UTC cannot split the day.
    const today = new Date('2026-06-15T12:00:00.000Z');
    vi.spyOn(clock, 'now').mockReturnValue(today);
    const done = (overrides: Parameters<typeof createSubmission>[1]) =>
      createSubmission(prisma, {
        status: 'DONE',
        createdAt: today,
        judgedAt: today,
        ...overrides,
      });

    const lastYear = addDays(today, -400);
    // easy: WA then two AC (distinct solved counts once), medium: AC, hard: WA only.
    await done({ userId: user.id, problemId: easy.id, verdict: 'WA', language: 'CPP' });
    await done({ userId: user.id, problemId: easy.id, verdict: 'AC', language: 'CPP' });
    await done({ userId: user.id, problemId: easy.id, verdict: 'AC', language: 'PYTHON' });
    await done({ userId: user.id, problemId: medium.id, verdict: 'AC', language: 'PYTHON' });
    await done({ userId: user.id, problemId: hard.id, verdict: 'WA', language: 'JAVA' });
    // A REFERENCE submission and an old submission must not count.
    await done({
      userId: user.id,
      problemId: hard.id,
      verdict: 'AC',
      kind: 'REFERENCE',
      language: 'JAVA',
    });
    await done({
      userId: user.id,
      problemId: hard.id,
      verdict: 'WA',
      language: 'JAVA',
      createdAt: lastYear,
    });
    // An AC on an unpublished problem is not part of the visible stats.
    await done({ userId: user.id, problemId: hidden.id, verdict: 'AC', language: 'CPP' });

    const contest = await createContest(prisma, {
      title: 'Round 1',
      startsAt: addDays(today, -10),
      endsAt: addDays(today, -9),
    });
    await prisma.ratingChange.create({
      data: { userId: user.id, contestId: contest.id, oldRating: 1200, newRating: 1337, rank: 3 },
    });

    const res = await request(app).get(`/api/users/${user.username}`);
    expect(res.status).toBe(200);
    const profile = ProfileSchema.parse(res.body);

    expect(profile.user).toMatchObject({ username: user.username, rating: 1337, bio: 'bio' });
    expect(profile.stats.solved).toEqual({ EASY: 1, MEDIUM: 1, HARD: 0, total: 2 });
    expect(profile.stats.available.EASY).toBeGreaterThanOrEqual(1);
    expect(profile.stats.available.MEDIUM).toBeGreaterThanOrEqual(1);
    expect(profile.stats.available.HARD).toBeGreaterThanOrEqual(1);
    // 7 NORMAL DONE submissions (REFERENCE excluded); 4 of them AC (easy x2, medium, hidden).
    expect(profile.stats.submissions).toBe(7);
    expect(profile.stats.accepted).toBe(4);
    expect(profile.stats.acceptanceRate).toBeCloseTo(4 / 7, 5);
    const langs = Object.fromEntries(profile.stats.languages.map((l) => [l.language, l.count]));
    expect(langs).toEqual({ CPP: 3, PYTHON: 2, JAVA: 2 });
    expect(profile.stats.globalRank).toBeGreaterThanOrEqual(1);

    expect(profile.heatmap).toHaveLength(365);
    const todayKey = today.toISOString().slice(0, 10);
    expect(profile.heatmap[364].date).toBe(todayKey);
    expect(profile.heatmap[364].count).toBe(6); // 5 + hidden, REFERENCE and old excluded
    expect(profile.heatmap[0].date).toBe(addDays(today, -364).toISOString().slice(0, 10));
    expect(profile.heatmap.map((d) => d.date)).toEqual(
      [...profile.heatmap.map((d) => d.date)].sort(),
    );
    expect(profile.heatmap.reduce((sum, d) => sum + d.count, 0)).toBe(6);

    expect(profile.ratingHistory).toHaveLength(1);
    expect(profile.ratingHistory[0]).toMatchObject({
      contestSlug: contest.slug,
      contestTitle: 'Round 1',
      oldRating: 1200,
      newRating: 1337,
      rank: 3,
    });

    // Recent accepted: one entry per problem (latest AC), newest first, published problems only.
    expect(profile.recentAccepted.map((r) => r.problemSlug).sort()).toEqual(
      [easy.slug, medium.slug].sort(),
    );
    expect(profile.recentAccepted[0].difficulty).toMatch(/EASY|MEDIUM/);
  });

  it('recentAccepted is capped at 10', async () => {
    const user = await createUser(prisma);
    for (let i = 0; i < 12; i += 1) {
      const problem = await createProblem(prisma);
      await createSubmission(prisma, {
        userId: user.id,
        problemId: problem.id,
        status: 'DONE',
        verdict: 'AC',
        createdAt: new Date(Date.now() - i * 60_000),
      });
    }
    const res = await request(app).get(`/api/users/${user.username}`);
    const profile = ProfileSchema.parse(res.body);
    expect(profile.stats.solved.total).toBe(12);
    expect(profile.recentAccepted).toHaveLength(10);
    const times = profile.recentAccepted.map((r) => Date.parse(r.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('globalRank is 1 + users with a strictly higher rating', async () => {
    const top = await createUser(prisma, { rating: 9000 });
    const tiedA = await createUser(prisma, { rating: 4000 });
    const tiedB = await createUser(prisma, { rating: 4000 });
    const rank = async (u: { username: string }) =>
      ProfileSchema.parse((await request(app).get(`/api/users/${u.username}`)).body).stats
        .globalRank;
    expect(await rank(top)).toBe(1);
    const a = await rank(tiedA);
    expect(a).toBe(await rank(tiedB));
    expect(a).toBe(2);
  });
});
