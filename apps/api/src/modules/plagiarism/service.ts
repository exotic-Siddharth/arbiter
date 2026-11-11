import type { Language, Verdict } from '@arbiter/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';
import { clock } from '../../lib/time';
import { fingerprints, hashSet, matchedLines, overlap, tokenize, type Fingerprint } from './winnow';

/**
 * Runs a PlagiarismReport (winnowing, spec section 9): sets status RUNNING, compares the
 * submissions, stores PlagiarismPair rows above the threshold, then DONE (or FAILED with error).
 * Called by the worker for jobs on the `plagiarism` queue. Re-running a report replaces its pairs.
 * Owner: lane A3b.
 */

interface CandidateFields {
  id: string;
  userId: string;
  createdAt: Date;
  verdict: Verdict | null;
}

/**
 * One submission per participant: the latest AC, or failing that the latest one. Returned oldest
 * first, so side A of a pair is always the earlier submission.
 */
export function pickCandidates<T extends CandidateFields>(submissions: readonly T[]): T[] {
  const byUser = new Map<string, T>();
  const newestFirst = [...submissions].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
  );
  for (const s of newestFirst) {
    const current = byUser.get(s.userId);
    if (!current || (current.verdict !== 'AC' && s.verdict === 'AC')) byUser.set(s.userId, s);
  }
  return [...byUser.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Lets timers, the heartbeat and BullMQ lock renewals of this shared worker process run. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

async function comparePairs(
  reportId: string,
  contestId: string,
  problemId: string,
  threshold: number,
): Promise<Prisma.PlagiarismPairCreateManyInput[]> {
  // Pick the candidates from light rows first; sources are loaded only for the chosen ones.
  const submissions: (CandidateFields & { language: Language })[] =
    await prisma.submission.findMany({
      where: {
        contestId,
        problemId,
        kind: 'NORMAL',
        user: { registrations: { some: { contestId } } },
      },
      select: { id: true, userId: true, language: true, createdAt: true, verdict: true },
    });
  const candidates = pickCandidates(submissions);
  const sources = new Map(
    (
      await prisma.submission.findMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        select: { id: true, sourceCode: true },
      })
    ).map((s) => [s.id, s.sourceCode]),
  );
  const prints: Fingerprint[][] = [];
  const sets: Set<bigint>[] = [];
  for (const c of candidates) {
    const print = fingerprints(tokenize(c.language, sources.get(c.id) ?? ''));
    prints.push(print);
    sets.push(hashSet(print));
    await yieldToEventLoop();
  }
  const pairs: Prisma.PlagiarismPairCreateManyInput[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const score = overlap(sets[i], sets[j]);
      if (score === 0 || score < threshold) continue;
      const lines = matchedLines(prints[i], prints[j]);
      pairs.push({
        reportId,
        problemId,
        submissionAId: candidates[i].id,
        submissionBId: candidates[j].id,
        similarity: score,
        matchedLinesA: lines.a,
        matchedLinesB: lines.b,
      });
    }
    await yieldToEventLoop();
  }
  return pairs;
}

export async function runPlagiarismReport(reportId: string): Promise<void> {
  const report = await prisma.plagiarismReport.findUnique({
    where: { id: reportId },
    include: { contest: { include: { problems: { orderBy: { ordinal: 'asc' } } } } },
  });
  if (!report) {
    logger.warn({ reportId }, 'plagiarism report not found');
    return;
  }
  await prisma.plagiarismReport.update({
    where: { id: reportId },
    data: { status: 'RUNNING', error: null, finishedAt: null },
  });
  try {
    const contest = report.contest;
    if (!contest) throw new Error('The report has no contest');
    const problemIds = report.problemId
      ? [report.problemId]
      : contest.problems.map((cp) => cp.problemId);
    const pairs: Prisma.PlagiarismPairCreateManyInput[] = [];
    for (const problemId of problemIds) {
      pairs.push(...(await comparePairs(reportId, contest.id, problemId, report.threshold)));
    }
    await prisma.$transaction([
      prisma.plagiarismPair.deleteMany({ where: { reportId } }),
      prisma.plagiarismPair.createMany({ data: pairs }),
      prisma.plagiarismReport.update({
        where: { id: reportId },
        data: { status: 'DONE', finishedAt: clock.now() },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ reportId, err: message }, 'plagiarism report failed');
    await prisma.plagiarismReport.update({
      where: { id: reportId },
      data: { status: 'FAILED', error: message.slice(0, 1000), finishedAt: clock.now() },
    });
  }
}
