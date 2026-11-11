import type { CreateRunBody, RunStatusResponse } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { enqueueRun, runKey, type StoredRun } from '../../judge/queue';
import { notFound } from '../../lib/errors';
import { clock } from '../../lib/time';

/** Limits of a run without problemSlug (R11). */
export const DEFAULT_RUN_LIMITS = { timeLimitMs: 1000, memoryLimitMb: 256 } as const;

interface Caller {
  id: string;
  role: 'USER' | 'ADMIN';
}

/**
 * Limits for a run (R11): problemSlug only selects the time and memory limits. The problem must
 * be published, or belong to a contest that has started, or the caller must be an admin;
 * otherwise 404 (an unpublished problem's existence is not revealed).
 */
export async function resolveRunLimits(
  prisma: PrismaClient,
  problemSlug: string | undefined,
  caller: Caller,
): Promise<{ timeLimitMs: number; memoryLimitMb: number }> {
  if (problemSlug === undefined) return DEFAULT_RUN_LIMITS;
  const problem = await prisma.problem.findUnique({
    where: { slug: problemSlug },
    select: {
      timeLimitMs: true,
      memoryLimitMb: true,
      isPublished: true,
      contestProblems: {
        where: { contest: { startsAt: { lte: clock.now() } } },
        select: { contestId: true },
        take: 1,
      },
    },
  });
  if (
    !problem ||
    !(problem.isPublished || caller.role === 'ADMIN' || problem.contestProblems.length > 0)
  ) {
    throw notFound('Problem not found');
  }
  return { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb };
}

/** POST /api/runs: resolve the limits and enqueue the run (nothing is stored in Postgres). */
export async function createRun(
  prisma: PrismaClient,
  body: CreateRunBody,
  caller: Caller,
): Promise<{ runId: string }> {
  const limits = await resolveRunLimits(prisma, body.problemSlug, caller);
  const runId = await enqueueRun({
    userId: caller.id,
    language: body.language,
    sourceCode: body.sourceCode,
    input: body.input,
    ...limits,
  });
  return { runId };
}

/** GET /api/runs/:runId: owner only; anyone else (and an expired run) gets 404. */
export async function getRun(
  redis: Redis,
  runId: string,
  caller: Caller,
): Promise<RunStatusResponse> {
  const raw = await redis.get(runKey(runId));
  if (!raw) throw notFound('Run not found or expired');
  let stored: StoredRun;
  try {
    stored = JSON.parse(raw) as StoredRun;
  } catch {
    throw notFound('Run not found or expired');
  }
  if (stored.userId !== caller.id) throw notFound('Run not found or expired');
  if (stored.status === 'DONE' && stored.result) return { status: 'DONE', result: stored.result };
  return { status: 'PENDING' };
}
