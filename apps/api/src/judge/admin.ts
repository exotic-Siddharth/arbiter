import type { AdminJob } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { conflict, notFound } from '../lib/errors';
import { enqueueGenerateOutputs, enqueueSubmission } from './queue';

/** Admin judge operations behind /api/admin (modules/admin/judge.routes.ts). */

async function problemWithReference(prisma: PrismaClient, problemId: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      referenceLanguage: true,
      referenceSolution: true,
      _count: { select: { testCases: true } },
    },
  });
  if (!problem) throw notFound('Problem not found');
  if (!problem.referenceLanguage || !problem.referenceSolution?.trim()) {
    throw conflict('The problem has no reference solution');
  }
  return {
    id: problem.id,
    language: problem.referenceLanguage,
    sourceCode: problem.referenceSolution,
    testCount: problem._count.testCases,
  };
}

/** Judge the stored reference as a REFERENCE submission (no counters, feeds or scoreboards). */
export async function validateReference(
  prisma: PrismaClient,
  problemId: string,
  adminId: string,
): Promise<{ submissionId: string }> {
  const problem = await problemWithReference(prisma, problemId);
  const submission = await prisma.submission.create({
    data: {
      kind: 'REFERENCE',
      userId: adminId,
      problemId: problem.id,
      language: problem.language,
      sourceCode: problem.sourceCode,
      status: 'QUEUED',
      testsTotal: problem.testCount,
    },
    select: { id: true },
  });
  await enqueueSubmission(submission.id);
  return { submissionId: submission.id };
}

/** Run the reference on every test input and overwrite expectedOutput (a GENERATE_OUTPUTS job). */
export async function startGenerateOutputs(
  prisma: PrismaClient,
  problemId: string,
): Promise<{ jobId: string }> {
  const problem = await problemWithReference(prisma, problemId);
  const job = await prisma.adminJob.create({
    data: { type: 'GENERATE_OUTPUTS', problemId: problem.id, total: problem.testCount },
    select: { id: true },
  });
  await enqueueGenerateOutputs(job.id);
  return { jobId: job.id };
}

export async function getAdminJob(prisma: PrismaClient, id: string): Promise<AdminJob> {
  const job = await prisma.adminJob.findUnique({ where: { id } });
  if (!job) throw notFound('Job not found');
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    total: job.total,
    error: job.error,
  };
}
