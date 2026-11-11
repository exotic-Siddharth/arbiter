import type { LeaderboardPage, LeaderboardQuery } from '@arbiter/shared';
import type { PrismaClient } from '@prisma/client';
import { paginate, toPage } from '../../lib/pagination';

interface Row {
  rank: number;
  username: string;
  rating: number;
  solved: number;
}

/**
 * Leaderboard. rank = 1 + users strictly ahead (SQL RANK()), so ties share a rank and the next
 * rank skips. "solved" = distinct published problems with an AC, NORMAL submissions only (R7).
 * by=rating breaks display ties by username; by=solved by higher rating, then username.
 */
export async function getLeaderboard(
  prisma: PrismaClient,
  query: LeaderboardQuery,
): Promise<LeaderboardPage> {
  const { skip, take, page, pageSize } = paginate(query);
  const total = await prisma.user.count();

  const rows =
    query.by === 'solved'
      ? await prisma.$queryRaw<Row[]>`
          WITH solved AS (
            SELECT s."userId", COUNT(DISTINCT s."problemId")::int AS solved
            FROM "Submission" s
            JOIN "Problem" p ON p."id" = s."problemId"
            WHERE s."kind" = 'NORMAL' AND s."verdict" = 'AC' AND p."isPublished" = true
            GROUP BY s."userId"
          ), ranked AS (
            SELECT u."username", u."usernameLower", u."rating",
                   COALESCE(sv.solved, 0)::int AS solved,
                   RANK() OVER (ORDER BY COALESCE(sv.solved, 0) DESC)::int AS rank
            FROM "User" u LEFT JOIN solved sv ON sv."userId" = u."id"
          )
          SELECT rank, username, rating, solved FROM ranked
          ORDER BY rank, rating DESC, "usernameLower"
          OFFSET ${skip} LIMIT ${take}`
      : await prisma.$queryRaw<Row[]>`
          WITH solved AS (
            SELECT s."userId", COUNT(DISTINCT s."problemId")::int AS solved
            FROM "Submission" s
            JOIN "Problem" p ON p."id" = s."problemId"
            WHERE s."kind" = 'NORMAL' AND s."verdict" = 'AC' AND p."isPublished" = true
            GROUP BY s."userId"
          ), ranked AS (
            SELECT u."username", u."usernameLower", u."rating",
                   COALESCE(sv.solved, 0)::int AS solved,
                   RANK() OVER (ORDER BY u."rating" DESC)::int AS rank
            FROM "User" u LEFT JOIN solved sv ON sv."userId" = u."id"
          )
          SELECT rank, username, rating, solved FROM ranked
          ORDER BY rank, "usernameLower"
          OFFSET ${skip} LIMIT ${take}`;

  return toPage(rows, total, { page, pageSize });
}
