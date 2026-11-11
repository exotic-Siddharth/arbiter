import type { Difficulty, Language, Profile } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { addDays, clock, startOfUtcDay, utcDayKey } from '../../lib/time';

const HEATMAP_DAYS = 365;
const RECENT_LIMIT = 10;

interface SolvedRow {
  difficulty: Difficulty;
  solved: number;
}

interface HeatmapRow {
  day: string;
  count: number;
}

interface RecentRow {
  slug: string;
  title: string;
  difficulty: Difficulty;
  at: Date;
}

const emptyCounts = (): Record<Difficulty, number> => ({ EASY: 0, MEDIUM: 0, HARD: 0 });

/**
 * Everything on the profile page. Only NORMAL submissions count (R7); "solved" is distinct
 * published problems with an AC, the same rule the leaderboard uses.
 */
export async function getProfile(prisma: PrismaClient, username: string): Promise<Profile> {
  const user = await prisma.user.findUnique({ where: { usernameLower: username.toLowerCase() } });
  if (!user) throw notFound('User not found');

  const today = startOfUtcDay(clock.now());
  const heatmapStart = addDays(today, -(HEATMAP_DAYS - 1));

  const [
    solvedRows,
    available,
    submissions,
    accepted,
    languageGroups,
    higherRated,
    heatmapRows,
    changes,
    recentRows,
  ] = await Promise.all([
    prisma.$queryRaw<SolvedRow[]>`
      SELECT p."difficulty"::text AS difficulty, COUNT(DISTINCT s."problemId")::int AS solved
      FROM "Submission" s
      JOIN "Problem" p ON p."id" = s."problemId"
      WHERE s."userId" = ${user.id} AND s."kind" = 'NORMAL' AND s."verdict" = 'AC'
        AND p."isPublished" = true
      GROUP BY p."difficulty"`,
    prisma.problem.groupBy({ by: ['difficulty'], where: { isPublished: true }, _count: true }),
    prisma.submission.count({ where: { userId: user.id, kind: 'NORMAL', status: 'DONE' } }),
    prisma.submission.count({
      where: { userId: user.id, kind: 'NORMAL', status: 'DONE', verdict: 'AC' },
    }),
    prisma.submission.groupBy({
      by: ['language'],
      where: { userId: user.id, kind: 'NORMAL', status: 'DONE' },
      _count: true,
    }),
    prisma.user.count({ where: { rating: { gt: user.rating } } }),
    prisma.$queryRaw<HeatmapRow[]>`
      SELECT to_char(s."createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM "Submission" s
      WHERE s."userId" = ${user.id} AND s."kind" = 'NORMAL' AND s."createdAt" >= ${heatmapStart}
      GROUP BY 1`,
    prisma.ratingChange.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { contest: { select: { slug: true, title: true } } },
    }),
    prisma.$queryRaw<RecentRow[]>`
      SELECT t.slug, t.title, t.difficulty, t.at FROM (
        SELECT DISTINCT ON (s."problemId")
          p."slug" AS slug, p."title" AS title, p."difficulty"::text AS difficulty,
          s."createdAt" AS at
        FROM "Submission" s
        JOIN "Problem" p ON p."id" = s."problemId"
        WHERE s."userId" = ${user.id} AND s."kind" = 'NORMAL' AND s."verdict" = 'AC'
          AND p."isPublished" = true
        ORDER BY s."problemId", s."createdAt" DESC
      ) t
      ORDER BY t.at DESC
      LIMIT ${RECENT_LIMIT}`,
  ]);

  const solved = emptyCounts();
  for (const row of solvedRows) solved[row.difficulty] = row.solved;
  const availableCounts = emptyCounts();
  for (const row of available) availableCounts[row.difficulty] = row._count;

  const perDay = new Map(heatmapRows.map((row) => [row.day, row.count]));
  const heatmap = Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const date = utcDayKey(addDays(heatmapStart, index));
    return { date, count: perDay.get(date) ?? 0 };
  });

  return {
    user: {
      username: user.username,
      rating: user.rating,
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
    },
    stats: {
      solved: { ...solved, total: solved.EASY + solved.MEDIUM + solved.HARD },
      available: availableCounts,
      submissions,
      accepted,
      acceptanceRate: submissions === 0 ? 0 : accepted / submissions,
      languages: languageGroups
        .map((group) => ({ language: group.language as Language, count: group._count }))
        .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language)),
      globalRank: higherRated + 1,
    },
    heatmap,
    ratingHistory: changes.map((change) => ({
      contestSlug: change.contest.slug,
      contestTitle: change.contest.title,
      oldRating: change.oldRating,
      newRating: change.newRating,
      rank: change.rank,
      date: change.createdAt.toISOString(),
    })),
    recentAccepted: recentRows.map((row) => ({
      problemSlug: row.slug,
      title: row.title,
      difficulty: row.difficulty,
      at: row.at.toISOString(),
    })),
  };
}
