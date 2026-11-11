import type { PrismaClient, User } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import { authHeader, createProblem, createUser, TEST_PASSWORD } from '../../test/factories';
import { createApp } from '../app';

// Postgres text cannot hold U+0000 (error 22021): request input carrying one is a client error.
const NUL = String.fromCharCode(0);

let prisma: PrismaClient;
const app = createApp({ rateLimits: false });
let user: User;
let admin: User;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  user = await createUser(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

function expectBadRequest(res: request.Response) {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
}

describe('NUL bytes in request input', () => {
  it.each([
    ['/api/problems?search=%00'],
    ['/api/problems?tag=%00'],
    ['/api/submissions?username=%00'],
    ['/api/users/a%00b'],
    ['/api/contests/a%00b'],
  ])('GET %s is a 400, not a 500', async (path) => {
    expectBadRequest(await request(app).get(path).set(authHeader(user)));
  });

  it('POST /api/auth/login with a NUL in the identifier is a 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: `a${NUL}b`, password: TEST_PASSWORD });
    expectBadRequest(res);
  });

  it('POST /api/submissions with a NUL in the source code is a 400', async () => {
    const problem = await createProblem(prisma);
    const res = await request(app)
      .post('/api/submissions')
      .set(authHeader(user))
      .send({ language: 'PYTHON', sourceCode: `print(1)${NUL}`, problemSlug: problem.slug });
    expectBadRequest(res);
  });

  it('PATCH /api/users/me with a NUL in the bio is a 400', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set(authHeader(user))
      .send({ bio: `hi${NUL}` });
    expectBadRequest(res);
  });

  it('admin problem statement with a NUL is a 400', async () => {
    const res = await request(app)
      .post('/api/admin/problems')
      .set(authHeader(admin))
      .send({
        slug: 'nul-statement',
        title: 'Nul statement',
        statementMd: `Print${NUL}`,
        difficulty: 'EASY',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
        tags: [],
      });
    expectBadRequest(res);
  });
});
