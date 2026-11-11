import { ProblemDetailSchema, ProblemPageSchema, TagListSchema } from '@arbiter/shared';
import type { PrismaClient, Problem, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  authHeader,
  createProblem,
  createSubmission,
  createUser,
  uniqueSuffix,
} from '../../../test/factories';
import { createApp } from '../../app';
import { DAY_MS } from '../../lib/time';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

const s = uniqueSuffix();
const tag = `set-${s}`;
const secretTag = `secret-${s}`;
let alpha: Problem;
let beta: Problem;
let gamma: Problem;
let hidden: Problem;
let solver: User;
let admin: User;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  const now = Date.now();
  alpha = await createProblem(prisma, {
    title: `Alpha Walk ${s}`,
    difficulty: 'EASY',
    tags: [tag, 'graphs'],
    submissionCount: 10,
    acceptedCount: 5,
    createdAt: new Date(now - 3 * DAY_MS),
  });
  beta = await createProblem(prisma, {
    title: `Beta Climb ${s}`,
    difficulty: 'MEDIUM',
    tags: [tag],
    submissionCount: 4,
    acceptedCount: 3,
    createdAt: new Date(now - 2 * DAY_MS),
  });
  gamma = await createProblem(prisma, {
    title: `Gamma Dive ${s}`,
    difficulty: 'HARD',
    tags: [tag, 'dp'],
    createdAt: new Date(now - DAY_MS),
  });
  hidden = await createProblem(prisma, {
    title: `Delta Hidden ${s}`,
    difficulty: 'EASY',
    isPublished: false,
    tags: [tag, secretTag],
    createdAt: new Date(now),
  });
  solver = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
  await createSubmission(prisma, {
    userId: solver.id,
    problemId: alpha.id,
    status: 'DONE',
    verdict: 'WA',
  });
  await createSubmission(prisma, {
    userId: solver.id,
    problemId: alpha.id,
    status: 'DONE',
    verdict: 'AC',
  });
  await createSubmission(prisma, {
    userId: solver.id,
    problemId: beta.id,
    status: 'DONE',
    verdict: 'WA',
  });
  // R7: a REFERENCE submission never counts for userStatus.
  await createSubmission(prisma, {
    userId: solver.id,
    problemId: gamma.id,
    kind: 'REFERENCE',
    status: 'DONE',
    verdict: 'AC',
  });
});

async function list(query: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await request(app).get('/api/problems').query(query).set(headers);
  expect(res.status).toBe(200);
  return ProblemPageSchema.parse(res.body);
}

const slugs = (page: { items: { slug: string }[] }) => page.items.map((item) => item.slug);

describe('GET /api/problems', () => {
  it('lists published problems newest first; unpublished ones are hidden', async () => {
    const page = await list({ tag });
    expect(slugs(page)).toEqual([gamma.slug, beta.slug, alpha.slug]);
    expect(page.total).toBe(3);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
  });

  it('hides unpublished problems from admins too (the admin list shows them)', async () => {
    const page = await list({ tag }, authHeader(admin));
    expect(slugs(page)).not.toContain(hidden.slug);
  });

  it('returns acceptanceRate, counts and sorted tags', async () => {
    const page = await list({ tag });
    const byslug = new Map(page.items.map((item) => [item.slug, item]));
    expect(byslug.get(alpha.slug)).toMatchObject({
      acceptanceRate: 0.5,
      submissionCount: 10,
      acceptedCount: 5,
      tags: ['graphs', tag].sort((a, b) => a.localeCompare(b)),
      difficulty: 'EASY',
      userStatus: null,
    });
    expect(byslug.get(beta.slug)?.acceptanceRate).toBe(0.75);
    expect(byslug.get(gamma.slug)?.acceptanceRate).toBe(0);
  });

  it('searches title and slug case-insensitively', async () => {
    expect(slugs(await list({ search: `alpha WALK ${s}` }))).toEqual([alpha.slug]);
    expect(slugs(await list({ search: beta.slug.toUpperCase() }))).toEqual([beta.slug]);
    expect((await list({ search: `Delta Hidden ${s}` })).total).toBe(0);
  });

  it('filters by difficulty (lower-case accepted) and tag', async () => {
    expect(slugs(await list({ tag, difficulty: 'medium' }))).toEqual([beta.slug]);
    expect(slugs(await list({ tag: 'dp' }))).toEqual([gamma.slug]);
    expect((await list({ tag: secretTag })).total).toBe(0);
  });

  it('sorts by difficulty, acceptance and title', async () => {
    expect(slugs(await list({ tag, sort: 'difficulty' }))).toEqual([
      alpha.slug,
      beta.slug,
      gamma.slug,
    ]);
    expect(slugs(await list({ tag, sort: 'acceptance' }))).toEqual([
      beta.slug,
      alpha.slug,
      gamma.slug,
    ]);
    expect(slugs(await list({ tag, sort: 'title' }))).toEqual([alpha.slug, beta.slug, gamma.slug]);
  });

  it('pages results', async () => {
    const first = await list({ tag, pageSize: '2' });
    expect(slugs(first)).toEqual([gamma.slug, beta.slug]);
    const second = await list({ tag, pageSize: '2', page: '2' });
    expect(slugs(second)).toEqual([alpha.slug]);
    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    const sortedSecond = await list({ tag, pageSize: '2', page: '2', sort: 'acceptance' });
    expect(slugs(sortedSecond)).toEqual([gamma.slug]);
  });

  it('sets userStatus for the signed-in user (NORMAL submissions only)', async () => {
    const page = await list({ tag }, authHeader(solver));
    const status = Object.fromEntries(page.items.map((item) => [item.slug, item.userStatus]));
    expect(status).toEqual({
      [alpha.slug]: 'SOLVED',
      [beta.slug]: 'ATTEMPTED',
      [gamma.slug]: null,
    });
  });

  it('filters by status for the signed-in user', async () => {
    const auth = authHeader(solver);
    expect(slugs(await list({ tag, status: 'solved' }, auth))).toEqual([alpha.slug]);
    expect(slugs(await list({ tag, status: 'attempted' }, auth))).toEqual([beta.slug]);
    expect(slugs(await list({ tag, status: 'unsolved' }, auth))).toEqual([gamma.slug, beta.slug]);
  });

  it('treats a guest as having solved and attempted nothing', async () => {
    expect((await list({ tag, status: 'solved' })).total).toBe(0);
    expect((await list({ tag, status: 'attempted' })).total).toBe(0);
    expect((await list({ tag, status: 'unsolved' })).total).toBe(3);
  });

  it('rejects an unknown sort with 400', async () => {
    const res = await request(app).get('/api/problems').query({ sort: 'random' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/problems/:slug', () => {
  it('returns the statement, limits and samples only', async () => {
    const res = await request(app).get(`/api/problems/${alpha.slug}`);
    expect(res.status).toBe(200);
    const detail = ProblemDetailSchema.parse(res.body);
    expect(detail).toMatchObject({
      slug: alpha.slug,
      title: alpha.title,
      statementMd: alpha.statementMd,
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      checker: 'TOKENS',
      userStatus: null,
      acceptanceRate: 0.5,
    });
    expect(detail.samples).toEqual([
      { ordinal: 1, input: '1 2\n', expectedOutput: '3\n', explanation: '1 + 2 = 3.' },
      {
        ordinal: 2,
        input: '10 -4\n',
        expectedOutput: '6\n',
        explanation: 'Negative numbers work too.',
      },
    ]);
    expect(res.body).not.toHaveProperty('contest');
    expect(JSON.stringify(res.body)).not.toContain('1000000000');
  });

  it("includes the signed-in user's status", async () => {
    const res = await request(app).get(`/api/problems/${beta.slug}`).set(authHeader(solver));
    expect(res.status).toBe(200);
    expect(res.body.userStatus).toBe('ATTEMPTED');
  });

  it('hides unpublished problems from guests and users, but not from admins', async () => {
    expect((await request(app).get(`/api/problems/${hidden.slug}`)).status).toBe(404);
    const asUser = await request(app).get(`/api/problems/${hidden.slug}`).set(authHeader(solver));
    expect(asUser.status).toBe(404);
    expect(asUser.body.error.code).toBe('NOT_FOUND');
    const asAdmin = await request(app).get(`/api/problems/${hidden.slug}`).set(authHeader(admin));
    expect(asAdmin.status).toBe(200);
    expect(ProblemDetailSchema.parse(asAdmin.body).slug).toBe(hidden.slug);
  });

  it('answers 404 for an unknown slug', async () => {
    const res = await request(app).get(`/api/problems/no-such-problem-${s}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/tags', () => {
  it('counts published problems per tag and omits tags without any', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    const tags = TagListSchema.parse(res.body);
    const counts = Object.fromEntries(tags.map((t) => [t.name, t.count]));
    expect(counts[tag]).toBe(3);
    expect(counts.graphs).toBe(1);
    expect(counts.dp).toBe(1);
    expect(counts).not.toHaveProperty(secretTag);
    const names = tags.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
