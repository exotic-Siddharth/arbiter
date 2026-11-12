import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { resetTables, setupTestDatabase } from '../../test/db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../test/factories';

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

/** An access token minted while the user was an ADMIN, then the user is demoted in the DB. */
async function demotedAdmin(): Promise<{ id: string; header: { Authorization: string } }> {
  const admin = await createUser(prisma, { role: 'ADMIN' });
  const header = authHeader(admin);
  await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
  return { id: admin.id, header };
}

describe('auth middleware: the ADMIN claim is re-checked against the DB on every route', () => {
  it("a demoted admin's still-valid token can no longer read another user's source", async () => {
    const victim = await createUser(prisma);
    const problem = await createProblem(prisma);
    const submission = await createSubmission(prisma, {
      userId: victim.id,
      problemId: problem.id,
      sourceCode: 'print("victim secret source")',
    });
    const { header } = await demotedAdmin();
    const res = await request(app).get(`/api/submissions/${submission.id}`).set(header);
    expect(res.status).toBe(200);
    expect(res.body.sourceCode).toBeNull();
  });

  it("a demoted admin's still-valid token can no longer read a draft problem", async () => {
    const draft = await createProblem(prisma, { isPublished: false });
    const { header } = await demotedAdmin();
    expect((await request(app).get(`/api/problems/${draft.slug}`).set(header)).status).toBe(404);
  });

  it("a demoted admin's still-valid token can no longer read an upcoming contest's problem", async () => {
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      problems: [{ problemId: problem.id, label: 'A' }],
    });
    const user = await createUser(prisma);
    const asUser = await request(app)
      .get(`/api/contests/${contest.slug}/problems/A`)
      .set(authHeader(user));
    expect(asUser.status).toBeGreaterThanOrEqual(400);
    const { header } = await demotedAdmin();
    const res = await request(app).get(`/api/contests/${contest.slug}/problems/A`).set(header);
    expect(res.status).toBe(asUser.status);
  });

  it('an admin token of a deleted user is 401 on an optional-auth route', async () => {
    const ghost = await createUser(prisma, { role: 'ADMIN' });
    const header = authHeader(ghost);
    await prisma.user.delete({ where: { id: ghost.id } });
    expect((await request(app).get('/api/problems').set(header)).status).toBe(401);
  });

  it('a current admin keeps admin reads; a USER token costs no role lookup', async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const draft = await createProblem(prisma, { isPublished: false });
    expect(
      (await request(app).get(`/api/problems/${draft.slug}`).set(authHeader(admin))).status,
    ).toBe(200);

    const user = await createUser(prisma);
    const spy = vi.spyOn(prisma.user, 'findUnique');
    try {
      await request(app).get('/api/problems').set(authHeader(user)).expect(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
