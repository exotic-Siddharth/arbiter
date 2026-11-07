import type { PrismaClient } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../src/lib/jwt';
import { contestStatus } from '../src/lib/time';
import { resetTables, setupTestDatabase } from './db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
  hashedTestPassword,
} from './factories';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDatabase();
});

describe('test database helpers', () => {
  it('uses database arbiter_test and the TEST_SCHEMA schema', async () => {
    const [where] = await prisma.$queryRaw<{ db: string; schema: string }[]>`
      SELECT current_database() AS db, current_schema() AS schema`;
    expect(where?.db).toBe('arbiter_test');
    expect(where?.schema).toBe(process.env.TEST_SCHEMA?.trim() || 'test');
  });

  it('resetTables empties every table', async () => {
    const user = await createUser(prisma);
    await createSubmission(prisma, {
      userId: user.id,
      problemId: (await createProblem(prisma)).id,
    });
    await resetTables(prisma);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.problem.count()).toBe(0);
    expect(await prisma.submission.count()).toBe(0);
  });
});

describe('factories', () => {
  it('createUser stores usernameLower and an Argon2id hash of TEST_PASSWORD', async () => {
    const user = await createUser(prisma, { username: 'Ada_Lovelace' });
    expect(user.usernameLower).toBe('ada_lovelace');
    expect(user.email).toBe('ada_lovelace@example.test');
    expect(user.role).toBe('USER');
    expect(user.passwordHash).toBe(await hashedTestPassword());
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('createProblem adds 2 sample and 3 hidden tests, samples first', async () => {
    const problem = await createProblem(prisma, { tags: ['math'] });
    expect(problem.isPublished).toBe(true);
    expect(problem.testCases.map((t) => [t.ordinal, t.isSample])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
      [5, false],
    ]);
    const tags = await prisma.problemTag.findMany({
      where: { problemId: problem.id },
      include: { tag: true },
    });
    expect(tags.map((t) => t.tag.name)).toEqual(['math']);
  });

  it('createContest is running by default and can attach problems and registrations', async () => {
    const user = await createUser(prisma);
    const problem = await createProblem(prisma);
    const contest = await createContest(prisma, {
      problems: [{ problemId: problem.id, label: 'A' }],
      registrations: [user.id],
    });
    expect(contestStatus(contest)).toBe('RUNNING');
    expect(await prisma.contestProblem.count({ where: { contestId: contest.id } })).toBe(1);
    expect(await prisma.contestRegistration.count({ where: { contestId: contest.id } })).toBe(1);
  });

  it('authHeader signs a verifiable access token', async () => {
    const admin = await createUser(prisma, { role: 'ADMIN' });
    const header = authHeader(admin);
    const claims = verifyAccessToken(header.Authorization.replace('Bearer ', ''));
    expect(claims).toMatchObject({ sub: admin.id, role: 'ADMIN', username: admin.username });
  });
});
