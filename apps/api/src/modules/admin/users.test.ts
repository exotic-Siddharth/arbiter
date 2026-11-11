import { AdminUserPageSchema, AdminUserResponseSchema, ErrorBodySchema } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { issueRefreshToken } from '../auth/tokens';
import { setUserRole } from './users.service';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  authHeader,
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

describe('admin users', () => {
  it('GET /api/admin/users: 401 without a token, 403 for a USER', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const user = await createUser(prisma);
    const res = await request(app).get('/api/admin/users').set(authHeader(user));
    expect(res.status).toBe(403);
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('PATCH /api/admin/users/:id is 401 for a guest and 403 for a USER', async () => {
    const user = await createUser(prisma);
    const target = await createUser(prisma);
    const guest = await request(app).patch(`/api/admin/users/${target.id}`).send({ role: 'ADMIN' });
    expect(guest.status).toBe(401);
    const res = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set(authHeader(user))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('USER');
  });

  it('lists users newest first with paging, submission counts (NORMAL only) and no secrets', async () => {
    await resetTables(prisma);
    const admin = await createUser(prisma, { role: 'ADMIN', username: 'adm_list' });
    const busy = await createUser(prisma, { username: 'adm_busy' });
    const problem = await createProblem(prisma);
    await createSubmission(prisma, { userId: busy.id, problemId: problem.id });
    await createSubmission(prisma, { userId: busy.id, problemId: problem.id });
    await createSubmission(prisma, { userId: busy.id, problemId: problem.id, kind: 'REFERENCE' });

    const res = await request(app).get('/api/admin/users').set(authHeader(admin));
    expect(res.status).toBe(200);
    const page = AdminUserPageSchema.parse(res.body);
    expect(page.page).toBe(1);
    expect(page.total).toBe(2);
    expect(page.items[0].username).toBe('adm_busy'); // created last
    expect(page.items.find((u) => u.username === 'adm_busy')?.submissionCount).toBe(2);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const paged = await request(app)
      .get('/api/admin/users')
      .query({ page: 2, pageSize: 1 })
      .set(authHeader(admin));
    const second = AdminUserPageSchema.parse(paged.body);
    expect(second.items).toHaveLength(1);
    expect(second.total).toBe(2);
    expect(second.items[0].username).toBe('adm_list');
  });

  it('searches by username or email, case-insensitively', async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const tag = uniqueSuffix();
    await createUser(prisma, { username: `findme_${tag}` });
    await createUser(prisma, { username: `other_${tag}`, email: `person.${tag}@mail.test` });
    await createUser(prisma, { username: `noise_${tag}` });

    const byName = await request(app)
      .get('/api/admin/users')
      .query({ search: `FINDME_${tag}` })
      .set(authHeader(admin));
    expect(AdminUserPageSchema.parse(byName.body).items.map((u) => u.username)).toEqual([
      `findme_${tag}`,
    ]);

    const byEmail = await request(app)
      .get('/api/admin/users')
      .query({ search: `PERSON.${tag}@Mail` })
      .set(authHeader(admin));
    const items = AdminUserPageSchema.parse(byEmail.body).items;
    expect(items.map((u) => u.username)).toEqual([`other_${tag}`]);
    expect(items[0].email).toBe(`person.${tag}@mail.test`);
  });

  it('PATCH changes the role and answers {user}', async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const target = await createUser(prisma);
    const promoted = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set(authHeader(admin))
      .send({ role: 'ADMIN' });
    expect(promoted.status).toBe(200);
    const parsed = AdminUserResponseSchema.parse(promoted.body);
    expect(parsed.user).toMatchObject({ id: target.id, role: 'ADMIN' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('ADMIN');

    const demoted = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set(authHeader(admin))
      .send({ role: 'USER' });
    expect(demoted.status).toBe(200);
    expect(demoted.body.user.role).toBe('USER');
  });

  it('PATCH validates the role and 404s an unknown id', async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const target = await createUser(prisma);
    const bad = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set(authHeader(admin))
      .send({ role: 'SUPERUSER' });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .patch('/api/admin/users/does-not-exist')
      .set(authHeader(admin))
      .send({ role: 'ADMIN' });
    expect(missing.status).toBe(404);
  });

  it('refuses to demote the last remaining admin (409)', async () => {
    await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'USER' } });
    const only = await createUser(prisma, { role: 'ADMIN' });
    // The caller is another (stale) admin id: the service-level guard is what is under test.
    await expect(setUserRole(prisma, 'someone-else', only.id, 'USER')).rejects.toMatchObject({
      status: 409,
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: only.id } })).role).toBe('ADMIN');
  });

  it('a demoted admin loses admin access at once (DB role re-checked), not after the token expires', async () => {
    const a = await createUser(prisma, { role: 'ADMIN' });
    const b = await createUser(prisma, { role: 'ADMIN' });
    const staleB = authHeader(b); // minted while B was still an admin
    const demote = await request(app)
      .patch(`/api/admin/users/${b.id}`)
      .set(authHeader(a))
      .send({ role: 'USER' });
    expect(demote.status).toBe(200);

    const list = await request(app).get('/api/admin/users').set(staleB);
    expect(list.status).toBe(403);
    const repromote = await request(app)
      .patch(`/api/admin/users/${b.id}`)
      .set(staleB)
      .send({ role: 'ADMIN' });
    expect(repromote.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).role).toBe('USER');
  });

  it('an admin token of a deleted user is 401', async () => {
    const ghost = await createUser(prisma, { role: 'ADMIN' });
    const header = authHeader(ghost);
    await prisma.user.delete({ where: { id: ghost.id } });
    expect((await request(app).get('/api/admin/users').set(header)).status).toBe(401);
  });

  it('demoting a user revokes their refresh tokens', async () => {
    const a = await createUser(prisma, { role: 'ADMIN' });
    const b = await createUser(prisma, { role: 'ADMIN' });
    const issued = await issueRefreshToken(prisma, b.id);
    await request(app)
      .patch(`/api/admin/users/${b.id}`)
      .set(authHeader(a))
      .send({ role: 'USER' })
      .expect(200);
    const record = await prisma.refreshToken.findUniqueOrThrow({ where: { id: issued.record.id } });
    expect(record.revokedAt).not.toBeNull();
  });

  it('PATCH refuses to change your own role (403)', async () => {
    const a = await createUser(prisma, { role: 'ADMIN' });
    await createUser(prisma, { role: 'ADMIN' });
    const res = await request(app)
      .patch(`/api/admin/users/${a.id}`)
      .set(authHeader(a))
      .send({ role: 'USER' });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe('ADMIN');
  });
});
