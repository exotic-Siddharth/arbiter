import type { PrismaClient, User } from '@prisma/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resetTables, setupTestDatabase } from '../../test/db';
import { createProblem, createUser } from '../../test/factories';
import { startGenerateOutputs, validateReference } from './admin';
import { getQueue } from './queue';

/** Admin judge operations when the queue is unreachable (A-45). */

let prisma: PrismaClient;
let admin: User;

const REFERENCE = { referenceLanguage: 'PYTHON' as const, referenceSolution: 'print(1)' };

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
  admin = await createUser(prisma, { role: 'ADMIN' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateReference', () => {
  it('fails the REFERENCE submission and rethrows when the enqueue fails', async () => {
    const problem = await createProblem(prisma, REFERENCE);
    vi.spyOn(getQueue('judge'), 'add').mockRejectedValue(new Error('redis down'));

    await expect(validateReference(prisma, problem.id, admin.id)).rejects.toThrow('redis down');

    const rows = await prisma.submission.findMany({ where: { problemId: problem.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'REFERENCE', status: 'FAILED', verdict: 'IE' });
    expect(rows[0]?.errorMessage).toContain('redis down');
  });

  it('gives up on a queue that never answers instead of hanging the request', async () => {
    const problem = await createProblem(prisma, REFERENCE);
    vi.spyOn(getQueue('judge'), 'add').mockReturnValue(new Promise(() => undefined));

    await expect(validateReference(prisma, problem.id, admin.id)).rejects.toThrow(/queue/i);

    const rows = await prisma.submission.findMany({ where: { problemId: problem.id } });
    expect(rows[0]).toMatchObject({ status: 'FAILED', verdict: 'IE' });
  });
});

describe('a problem with no test cases (A-02)', () => {
  it('validate-reference and generate-outputs answer 409 and create no rows', async () => {
    const problem = await createProblem(prisma, { ...REFERENCE, tests: [] });
    await expect(validateReference(prisma, problem.id, admin.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(startGenerateOutputs(prisma, problem.id)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.submission.count({ where: { problemId: problem.id } })).toBe(0);
    expect(await prisma.adminJob.count({ where: { problemId: problem.id } })).toBe(0);
  });
});

describe('startGenerateOutputs', () => {
  it('fails the AdminJob and rethrows when the enqueue fails', async () => {
    const problem = await createProblem(prisma, REFERENCE);
    vi.spyOn(getQueue('judge'), 'add').mockRejectedValue(new Error('redis down'));

    await expect(startGenerateOutputs(prisma, problem.id)).rejects.toThrow('redis down');

    const jobs = await prisma.adminJob.findMany({ where: { problemId: problem.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'FAILED' });
    expect(jobs[0]?.error).toContain('redis down');
    expect(jobs[0]?.finishedAt).not.toBeNull();
  });
});
