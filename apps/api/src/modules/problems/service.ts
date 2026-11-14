import type {
  ListProblemsQuery,
  ProblemDetail,
  ProblemPage,
  TagCount,
  UserProblemStatus,
} from '@arbiter/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { paginate, toPage } from '../../lib/pagination';
import {
  acceptanceRate,
  problemDetailInclude,
  problemDetailOmit,
  problemSummarySelect,
  toProblemDetail,
  toProblemSummary,
} from './mappers';

export interface Viewer {
  id: string;
  role: 'USER' | 'ADMIN';
}

/**
 * The viewer's status per problem: SOLVED if any NORMAL submission is AC, ATTEMPTED if there is
 * any other NORMAL submission (R7: REFERENCE submissions never count). Problems the user never
 * submitted to are absent. Guests (userId undefined) get an empty map.
 */
export async function userStatuses(
  prisma: PrismaClient,
  userId: string | undefined,
  problemIds: string[],
): Promise<Map<string, UserProblemStatus>> {
  const statuses = new Map<string, UserProblemStatus>();
  if (!userId || problemIds.length === 0) return statuses;
  const groups = await prisma.submission.groupBy({
    by: ['problemId', 'verdict'],
    where: { userId, kind: 'NORMAL', problemId: { in: problemIds } },
  });
  for (const group of groups) {
    if (group.verdict === 'AC') statuses.set(group.problemId, 'SOLVED');
    else if (!statuses.has(group.problemId)) statuses.set(group.problemId, 'ATTEMPTED');
  }
  return statuses;
}

const NO_MATCH: Prisma.ProblemWhereInput = { id: { in: [] } };

/** status=solved|attempted|unsolved. A guest has solved and attempted nothing. */
function statusFilter(
  status: ListProblemsQuery['status'],
  userId: string | undefined,
): Prisma.ProblemWhereInput | undefined {
  if (!status) return undefined;
  if (!userId) return status === 'unsolved' ? undefined : NO_MATCH;
  const solved: Prisma.ProblemWhereInput = {
    submissions: { some: { userId, kind: 'NORMAL', verdict: 'AC' } },
  };
  switch (status) {
    case 'solved':
      return solved;
    case 'attempted':
      return { submissions: { some: { userId, kind: 'NORMAL' } }, NOT: solved };
    case 'unsolved':
      return { NOT: solved };
  }
}

/** The problems anyone, signed out included, may open at /problems/:slug (also the sitemap's). */
export const PUBLIC_PROBLEMS = { isPublished: true } satisfies Prisma.ProblemWhereInput;

function listWhere(query: ListProblemsQuery, userId: string | undefined): Prisma.ProblemWhereInput {
  const and: Prisma.ProblemWhereInput[] = [PUBLIC_PROBLEMS];
  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }
  if (query.difficulty) and.push({ difficulty: query.difficulty });
  if (query.tag) {
    and.push({ tags: { some: { tag: { name: { equals: query.tag, mode: 'insensitive' } } } } });
  }
  const status = statusFilter(query.status, userId);
  if (status) and.push(status);
  return { AND: and };
}

const ORDER_BY: Record<
  Exclude<ListProblemsQuery['sort'], 'acceptance'>,
  Prisma.ProblemOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  difficulty: [{ difficulty: 'asc' }, { title: 'asc' }, { id: 'asc' }],
  title: [{ title: 'asc' }, { id: 'asc' }],
};

/**
 * Ids of one page of problems. acceptance is a ratio Prisma cannot order by, so that sort ranks
 * the (small) filtered id list in memory: rate desc, then submissions desc, then title.
 */
async function pageIds(
  prisma: PrismaClient,
  where: Prisma.ProblemWhereInput,
  sort: ListProblemsQuery['sort'],
  skip: number,
  take: number,
): Promise<string[]> {
  if (sort !== 'acceptance') {
    const rows = await prisma.problem.findMany({
      where,
      orderBy: ORDER_BY[sort],
      skip,
      take,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
  const rows = await prisma.problem.findMany({
    where,
    select: { id: true, title: true, submissionCount: true, acceptedCount: true },
  });
  return rows
    .map((row) => ({ ...row, rate: acceptanceRate(row.acceptedCount, row.submissionCount) }))
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.submissionCount - a.submissionCount ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    )
    .slice(skip, skip + take)
    .map((row) => row.id);
}

/** GET /api/problems: published problems only (spec section 9), for everyone. */
export async function listProblems(
  prisma: PrismaClient,
  query: ListProblemsQuery,
  viewer: Viewer | undefined,
): Promise<ProblemPage> {
  const pagination = paginate(query);
  const where = listWhere(query, viewer?.id);
  const [total, ids] = await Promise.all([
    prisma.problem.count({ where }),
    pageIds(prisma, where, query.sort, pagination.skip, pagination.take),
  ]);
  const rows = await prisma.problem.findMany({
    where: { id: { in: ids } },
    select: problemSummarySelect,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const statuses = await userStatuses(prisma, viewer?.id, ids);
  const items = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toProblemSummary(row, statuses.get(id) ?? null)] : [];
  });
  return toPage(items, total, pagination);
}

/** GET /api/problems/:slug: published, or any problem for an admin; 404 otherwise. */
export async function getProblemDetail(
  prisma: PrismaClient,
  slug: string,
  viewer: Viewer | undefined,
): Promise<ProblemDetail> {
  const row = await prisma.problem.findUnique({
    where: { slug },
    include: problemDetailInclude,
    omit: problemDetailOmit,
  });
  if (!row || (!row.isPublished && viewer?.role !== 'ADMIN')) {
    throw notFound('Problem not found');
  }
  const statuses = await userStatuses(prisma, viewer?.id, [row.id]);
  return toProblemDetail(row, { userStatus: statuses.get(row.id) ?? null });
}

/** GET /api/tags: published problems per tag; tags without any are omitted. Sorted by name. */
export async function listTags(prisma: PrismaClient): Promise<TagCount[]> {
  const tags = await prisma.tag.findMany({
    select: {
      name: true,
      _count: { select: { problems: { where: { problem: { isPublished: true } } } } },
    },
  });
  return tags
    .map((tag) => ({ name: tag.name, count: tag._count.problems }))
    .filter((tag) => tag.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
