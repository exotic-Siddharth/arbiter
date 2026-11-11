import type { Stats } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { clock, startOfUtcDay } from '../../lib/time';

/** Landing-page counters. Published problems, NORMAL submissions only (R7). */
export async function getSiteStats(prisma: PrismaClient): Promise<Stats> {
  const now = clock.now();
  const [problems, users, submissions, judgedToday, runningContests] = await Promise.all([
    prisma.problem.count({ where: { isPublished: true } }),
    prisma.user.count(),
    prisma.submission.count({ where: { kind: 'NORMAL' } }),
    prisma.submission.count({
      where: { kind: 'NORMAL', status: 'DONE', judgedAt: { gte: startOfUtcDay(now) } },
    }),
    prisma.contest.count({
      where: { isPublished: true, startsAt: { lte: now }, endsAt: { gt: now } },
    }),
  ]);
  return { problems, users, submissions, judgedToday, runningContests };
}
