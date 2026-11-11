import { StatsSchema } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { addDays, addMinutes } from '../../lib/time';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../../test/factories';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

const getStats = async () => {
  const res = await request(app).get('/api/stats');
  expect(res.status).toBe(200);
  return StatsSchema.parse(res.body);
};

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

describe('GET /api/stats', () => {
  it('is all zeros on an empty database', async () => {
    expect(await getStats()).toEqual({
      problems: 0,
      users: 0,
      submissions: 0,
      judgedToday: 0,
      runningContests: 0,
    });
  });

  it('counts published problems, users, NORMAL submissions, judged-today and running contests', async () => {
    const u1 = await createUser(prisma);
    const u2 = await createUser(prisma);
    const published = await createProblem(prisma);
    await createProblem(prisma);
    await createProblem(prisma, { isPublished: false });

    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const sub = (overrides: Parameters<typeof createSubmission>[1]) =>
      createSubmission(prisma, overrides);
    // Judged today (DONE): 2. Judged yesterday: 1. Still queued: 1. Reference (judged today): 1.
    await sub({
      userId: u1.id,
      problemId: published.id,
      status: 'DONE',
      verdict: 'AC',
      judgedAt: now,
    });
    await sub({
      userId: u2.id,
      problemId: published.id,
      status: 'DONE',
      verdict: 'WA',
      judgedAt: now,
    });
    await sub({
      userId: u1.id,
      problemId: published.id,
      status: 'DONE',
      verdict: 'AC',
      judgedAt: addMinutes(startOfToday, -5),
    });
    await sub({ userId: u1.id, problemId: published.id });
    await sub({
      userId: u1.id,
      problemId: published.id,
      kind: 'REFERENCE',
      status: 'DONE',
      verdict: 'AC',
      judgedAt: now,
    });

    await createContest(prisma); // running
    await createContest(prisma, {
      startsAt: addDays(now, 1),
      endsAt: addDays(now, 2),
    }); // upcoming
    await createContest(prisma, {
      startsAt: addDays(now, -2),
      endsAt: addDays(now, -1),
    }); // ended
    await createContest(prisma, { isPublished: false }); // running but unpublished

    expect(await getStats()).toEqual({
      problems: 2,
      users: 2,
      submissions: 4,
      judgedToday: 2,
      runningContests: 1,
    });
  });
});
