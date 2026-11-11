import type { PrismaClient } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetTables, setupTestDatabase } from '../../../test/db';
import {
  createContest,
  createProblem,
  createSubmission,
  createUser,
} from '../../../test/factories';
import {
  CPP_EDITED,
  CPP_ORIGINAL,
  CPP_RENAMED_REFORMATTED,
  CPP_UNRELATED,
  PY_ORIGINAL,
  PY_RENAMED,
} from './samples.fixture';
import { runPlagiarismReport } from './service';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await setupTestDatabase();
  await resetTables(prisma);
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** alice (original AC), bob (renamed copy, AC after an unrelated WA), carol (unrelated AC). */
async function seed() {
  const [a, b] = [await createProblem(prisma), await createProblem(prisma)];
  const [alice, bob, carol, dave] = await Promise.all([
    createUser(prisma),
    createUser(prisma),
    createUser(prisma),
    createUser(prisma),
  ]);
  const contest = await createContest(prisma, {
    problems: [
      { problemId: a.id, label: 'A' },
      { problemId: b.id, label: 'B' },
    ],
    registrations: [alice.id, bob.id, carol.id, dave.id],
  });
  const sub = (
    userId: string,
    problemId: string,
    sourceCode: string,
    minute: number,
    verdict: 'AC' | 'WA',
    language: 'CPP' | 'PYTHON' = 'CPP',
  ) =>
    createSubmission(prisma, {
      userId,
      problemId,
      contestId: contest.id,
      language,
      sourceCode,
      status: 'DONE',
      verdict,
      createdAt: minutesAgo(minute),
    });
  const aliceA = await sub(alice.id, a.id, CPP_ORIGINAL, 50, 'AC');
  await sub(bob.id, a.id, CPP_UNRELATED, 45, 'WA');
  const bobA = await sub(bob.id, a.id, CPP_RENAMED_REFORMATTED, 40, 'AC');
  // A later WA does not replace bob's latest AC.
  await sub(bob.id, a.id, 'int main() { return 1; }', 30, 'WA');
  await sub(carol.id, a.id, CPP_UNRELATED, 35, 'AC');
  // dave never gets AC: his latest submission is compared.
  await sub(dave.id, a.id, 'int main() { return 2; }', 33, 'WA');
  const daveLatest = await sub(dave.id, a.id, CPP_EDITED, 20, 'WA');
  // Problem B: a Python copy pair.
  const aliceB = await sub(alice.id, b.id, PY_ORIGINAL, 25, 'AC', 'PYTHON');
  const carolB = await sub(carol.id, b.id, PY_RENAMED, 15, 'AC', 'PYTHON');
  // Ignored: a practice submission and a REFERENCE run with the same code.
  await createSubmission(prisma, { userId: carol.id, problemId: a.id, sourceCode: CPP_ORIGINAL });
  await createSubmission(prisma, {
    userId: carol.id,
    problemId: a.id,
    contestId: contest.id,
    kind: 'REFERENCE',
    sourceCode: CPP_ORIGINAL,
  });
  return { contest, a, b, aliceA, bobA, daveLatest, aliceB, carolB };
}

describe('runPlagiarismReport', () => {
  it('stores pairs above the threshold with matched lines, then marks the report DONE', async () => {
    const s = await seed();
    const report = await prisma.plagiarismReport.create({
      data: { contestId: s.contest.id, threshold: 0.6 },
    });
    await runPlagiarismReport(report.id);

    const done = await prisma.plagiarismReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(done).toMatchObject({ status: 'DONE', error: null });
    expect(done.finishedAt).not.toBeNull();

    const pairs = await prisma.plagiarismPair.findMany({ where: { reportId: report.id } });
    const key = (x: string, y: string) => [x, y].sort().join('|');
    const found = new Map(pairs.map((p) => [key(p.submissionAId, p.submissionBId), p]));
    expect(pairs).toHaveLength(4);
    // A: alice ~ bob (renamed copy), dave's near copy ~ both; carol is unrelated.
    const aliceBob = found.get(key(s.aliceA.id, s.bobA.id));
    expect(aliceBob).toBeDefined();
    expect(aliceBob!.problemId).toBe(s.a.id);
    expect(aliceBob!.similarity).toBeGreaterThanOrEqual(0.9);
    const aliceDave = found.get(key(s.aliceA.id, s.daveLatest.id))?.similarity;
    expect(aliceDave).toBeGreaterThanOrEqual(0.6);
    expect(aliceDave).toBeLessThan(1);
    expect(found.get(key(s.bobA.id, s.daveLatest.id))).toBeDefined();
    // B: the Python pair.
    const pythonPair = found.get(key(s.aliceB.id, s.carolB.id));
    expect(pythonPair?.problemId).toBe(s.b.id);
    for (const pair of pairs) {
      expect(pair.similarity).toBeGreaterThanOrEqual(0.6);
      expect(pair.similarity).toBeLessThanOrEqual(1);
      const linesA = pair.matchedLinesA as number[];
      const linesB = pair.matchedLinesB as number[];
      expect(linesA.length).toBeGreaterThan(0);
      expect(linesB.length).toBeGreaterThan(0);
      expect(linesA.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
    }
    // Side A is the earlier submission.
    expect(aliceBob!.submissionAId).toBe(s.aliceA.id);
  });

  it('limits the comparison to one problem and is idempotent when re-run', async () => {
    const s = await seed();
    const report = await prisma.plagiarismReport.create({
      data: { contestId: s.contest.id, problemId: s.b.id, threshold: 0.5 },
    });
    await runPlagiarismReport(report.id);
    await runPlagiarismReport(report.id);
    const pairs = await prisma.plagiarismPair.findMany({ where: { reportId: report.id } });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      problemId: s.b.id,
      submissionAId: s.aliceB.id,
      submissionBId: s.carolB.id,
    });
  });

  it('a threshold of 1 keeps only token-identical solutions', async () => {
    const s = await seed();
    const report = await prisma.plagiarismReport.create({
      data: { contestId: s.contest.id, problemId: s.a.id, threshold: 1 },
    });
    await runPlagiarismReport(report.id);
    const pairs = await prisma.plagiarismPair.findMany({ where: { reportId: report.id } });
    expect(pairs.map((p) => [p.submissionAId, p.submissionBId])).toEqual([
      [s.aliceA.id, s.bobA.id],
    ]);
  });

  it('marks a report without a contest FAILED with an error and ignores unknown ids', async () => {
    const report = await prisma.plagiarismReport.create({ data: { threshold: 0.6 } });
    await runPlagiarismReport(report.id);
    const failed = await prisma.plagiarismReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toMatch(/contest/i);
    expect(failed.finishedAt).not.toBeNull();
    await expect(runPlagiarismReport('no-such-report')).resolves.toBeUndefined();
  });
});
