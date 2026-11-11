import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import {
  authHeader,
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../test/factories';
import { createApp } from '../app';

/**
 * Review A-21: list endpoints must not load the heavy columns (sourceCode, compileOutput,
 * statementMd, referenceSolution) just to drop them in the mapper.
 */

const app = createApp({ rateLimits: false });
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

type Model = 'submission' | 'problem' | 'contestProblem';
type Method = 'findMany' | 'findUnique';
type Loaded = Record<string, unknown>;

/** Rows returned by findMany/findUnique while the current test runs, per model and method. */
const seen = new Map<string, Loaded[]>();
const key = (model: Model, method: Method) => `${model}.${method}`;

function spyOnRows(model: Model, method: Method): void {
  const target = prisma[model] as unknown as Record<
    Method,
    (...args: unknown[]) => Promise<unknown>
  >;
  const original = target[method].bind(target);
  vi.spyOn(target, method).mockImplementation(async (...args: unknown[]) => {
    const result = await original(...args);
    const rows = seen.get(key(model, method)) ?? [];
    for (const row of Array.isArray(result) ? result : [result]) {
      if (row) rows.push(row as Loaded);
    }
    seen.set(key(model, method), rows);
    return result;
  });
}

beforeAll(() => {
  spyOnRows('submission', 'findMany');
  spyOnRows('problem', 'findMany');
  spyOnRows('problem', 'findUnique');
  spyOnRows('contestProblem', 'findUnique');
});

/** The rows `model.method` returned while `fn` ran. */
async function loadedRows(model: Model, method: Method, fn: () => Promise<unknown>) {
  seen.clear();
  await fn();
  return seen.get(key(model, method)) ?? [];
}

async function seed() {
  const admin = await createUser(prisma, { role: 'ADMIN' });
  const user = await createUser(prisma);
  const problem = await createProblem(prisma, {
    referenceSolution: 'print(1)\n'.repeat(50),
    tests: [{ input: '1 2\n', expectedOutput: '3\n', isSample: true }],
  });
  const contest = await createContest(prisma, {
    problems: [{ problemId: problem.id, label: 'A' }],
    registrations: [user.id],
  });
  await createSubmission(prisma, {
    userId: user.id,
    problemId: problem.id,
    contestId: contest.id,
    status: 'DONE',
    verdict: 'WA',
    compileOutput: 'warning: something',
  });
  // A practice submission: visible to guests in the public list.
  await createSubmission(prisma, {
    userId: user.id,
    problemId: problem.id,
    status: 'DONE',
    verdict: 'AC',
  });
  return { admin, user, problem, contest };
}

describe('summary list queries skip heavy columns', () => {
  it('GET /api/submissions loads no sourceCode or compileOutput', async () => {
    await seed();
    const rows = await loadedRows('submission', 'findMany', () =>
      request(app).get('/api/submissions?pageSize=100'),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('sourceCode');
      expect(row).not.toHaveProperty('compileOutput');
    }
  });

  it('GET /api/contests/:slug/submissions loads no sourceCode or compileOutput', async () => {
    const { admin, contest } = await seed();
    const rows = await loadedRows('submission', 'findMany', () =>
      request(app).get(`/api/contests/${contest.slug}/submissions`).set(authHeader(admin)),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('sourceCode');
      expect(row).not.toHaveProperty('compileOutput');
    }
  });

  it('GET /api/problems loads no statementMd or referenceSolution', async () => {
    await seed();
    const rows = await loadedRows('problem', 'findMany', () =>
      request(app).get('/api/problems?pageSize=100'),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('statementMd');
      expect(row).not.toHaveProperty('referenceSolution');
    }
  });

  it('problem detail routes load the statement but never referenceSolution', async () => {
    const { admin, problem, contest } = await seed();
    const direct = await loadedRows('problem', 'findUnique', () =>
      request(app).get(`/api/problems/${problem.slug}`),
    );
    expect(direct).toHaveLength(1);
    expect(direct[0]).toHaveProperty('statementMd');
    expect(direct[0]).not.toHaveProperty('referenceSolution');

    const viaContest = await loadedRows('contestProblem', 'findUnique', () =>
      request(app).get(`/api/contests/${contest.slug}/problems/A`).set(authHeader(admin)),
    );
    expect(viaContest).toHaveLength(1);
    const loaded = viaContest[0].problem as Record<string, unknown>;
    expect(loaded).toHaveProperty('statementMd');
    expect(loaded).not.toHaveProperty('referenceSolution');
  });
});
