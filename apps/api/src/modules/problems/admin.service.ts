import {
  LIMITS,
  type AdminProblem,
  type AdminProblemBody,
  type AdminProblemListQuery,
  type AdminProblemPage,
  type AdminTestBody,
  type AdminTestCase,
  type AdminTestCaseSummary,
  type BulkTestsBody,
  type BulkTestsResponse,
} from '@arbiter/shared';
import type { Prisma, PrismaClient, Problem, TestCase } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors';
import { paginate, toPage } from '../../lib/pagination';
import { toIso } from '../../lib/time';
import { invalidateScoreboard } from '../contests/scoreboard';

/** Admin problem and test-case content (/api/admin/problems). Owner: lane A3a. */

const adminProblemInclude = {
  tags: { include: { tag: { select: { name: true } } } },
  testCases: { select: { isSample: true } },
} satisfies Prisma.ProblemInclude;

type AdminProblemRow = Problem & {
  tags: { tag: { name: string } }[];
  testCases: { isSample: boolean }[];
};

const sortedTags = (row: { tags: { tag: { name: string } }[] }) =>
  row.tags.map((link) => link.tag.name).sort((a, b) => a.localeCompare(b));

export function toAdminProblem(row: AdminProblemRow): AdminProblem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    statementMd: row.statementMd,
    difficulty: row.difficulty,
    timeLimitMs: row.timeLimitMs,
    memoryLimitMb: row.memoryLimitMb,
    checker: row.checker,
    floatTolerance: row.floatTolerance,
    isPublished: row.isPublished,
    tags: sortedTags(row),
    referenceLanguage: row.referenceLanguage,
    referenceSolution: row.referenceSolution,
    testCount: row.testCases.length,
    sampleCount: row.testCases.filter((test) => test.isSample).length,
    submissionCount: row.submissionCount,
    acceptedCount: row.acceptedCount,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toAdminTestCase(row: TestCase): AdminTestCase {
  return {
    id: row.id,
    problemId: row.problemId,
    ordinal: row.ordinal,
    input: row.input,
    expectedOutput: row.expectedOutput,
    isSample: row.isSample,
    explanation: row.explanation,
  };
}

/** Distinct tag names -> nested ProblemTag creates (tags are created on first use). */
function tagCreates(names: string[]): Prisma.ProblemTagCreateWithoutProblemInput[] {
  return [...new Set(names)].map((name) => ({
    tag: { connectOrCreate: { where: { name }, create: { name } } },
  }));
}

/** Scalar fields of a create or full replace. Reference fields: undefined = unchanged, null = clear. */
function problemFields(body: AdminProblemBody) {
  return {
    slug: body.slug,
    title: body.title,
    statementMd: body.statementMd,
    difficulty: body.difficulty,
    timeLimitMs: body.timeLimitMs,
    memoryLimitMb: body.memoryLimitMb,
    checker: body.checker,
    floatTolerance: body.floatTolerance ?? null,
    isPublished: body.isPublished,
    ...(body.referenceLanguage !== undefined ? { referenceLanguage: body.referenceLanguage } : {}),
    ...(body.referenceSolution !== undefined ? { referenceSolution: body.referenceSolution } : {}),
  };
}

async function assertProblem(prisma: PrismaClient, id: string): Promise<void> {
  const found = await prisma.problem.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound('Problem not found');
}

/** GET /api/admin/problems: every problem (published or not), newest first, with search. */
export async function listAdminProblems(
  prisma: PrismaClient,
  query: AdminProblemListQuery,
): Promise<AdminProblemPage> {
  const pagination = paginate(query);
  const where: Prisma.ProblemWhereInput = query.search
    ? {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        slug: true,
        title: true,
        difficulty: true,
        isPublished: true,
        referenceLanguage: true,
        submissionCount: true,
        acceptedCount: true,
        updatedAt: true,
        tags: { include: { tag: { select: { name: true } } } },
        _count: { select: { testCases: true } },
      },
    }),
  ]);
  // hasReference without loading the solution text of every row.
  const withReference = new Set(
    (
      await prisma.problem.findMany({
        where: { id: { in: rows.map((row) => row.id) }, referenceSolution: { not: null } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  const items = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    difficulty: row.difficulty,
    isPublished: row.isPublished,
    tags: sortedTags(row),
    testCount: row._count.testCases,
    submissionCount: row.submissionCount,
    acceptedCount: row.acceptedCount,
    hasReference: withReference.has(row.id),
    updatedAt: toIso(row.updatedAt),
  }));
  return toPage(items, total, pagination);
}

export async function getAdminProblem(prisma: PrismaClient, id: string): Promise<AdminProblem> {
  const row = await prisma.problem.findUnique({ where: { id }, include: adminProblemInclude });
  if (!row) throw notFound('Problem not found');
  return toAdminProblem(row);
}

const NO_TESTS_TO_PUBLISH = 'A problem needs at least one test case before it can be published';

/** POST: a duplicate slug is a Prisma P2002, which the error middleware maps to 409. A new problem has no tests, so it cannot be created published (409). */
export async function createAdminProblem(
  prisma: PrismaClient,
  body: AdminProblemBody,
  authorId: string,
): Promise<AdminProblem> {
  if (body.isPublished) throw conflict(NO_TESTS_TO_PUBLISH);
  const row = await prisma.problem.create({
    data: {
      ...problemFields(body),
      referenceLanguage: body.referenceLanguage ?? null,
      referenceSolution: body.referenceSolution ?? null,
      authorId,
      tags: { create: tagCreates(body.tags) },
    },
    include: adminProblemInclude,
  });
  return toAdminProblem(row);
}

/** PUT: full replace, tags included (the nested write runs in one transaction). Publishing needs at least one test (409). */
export async function updateAdminProblem(
  prisma: PrismaClient,
  id: string,
  body: AdminProblemBody,
): Promise<AdminProblem> {
  await assertProblem(prisma, id);
  if (body.isPublished && (await prisma.testCase.count({ where: { problemId: id } })) === 0) {
    throw conflict(NO_TESTS_TO_PUBLISH);
  }
  const row = await prisma.problem.update({
    where: { id },
    data: { ...problemFields(body), tags: { deleteMany: {}, create: tagCreates(body.tags) } },
    include: adminProblemInclude,
  });
  return toAdminProblem(row);
}

/**
 * DELETE: test cases, submissions and contest links cascade; the boards of those contests are
 * dropped. 409 when the problem is in a rated contest: the cascade would rewrite that contest's
 * problem list and standings while its RatingChange rows and user ratings keep the old ranks. The
 * condition is part of the DELETE, so a contest rated meanwhile cannot slip through.
 */
export async function deleteAdminProblem(prisma: PrismaClient, id: string): Promise<void> {
  const links = await prisma.contestProblem.findMany({
    where: { problemId: id },
    select: { contestId: true },
  });
  const { count } = await prisma.problem.deleteMany({
    where: { id, contestProblems: { none: { contest: { ratedAt: { not: null } } } } },
  });
  if (count === 0) {
    if (await prisma.problem.findUnique({ where: { id }, select: { id: true } })) {
      throw conflict('A problem of a rated contest cannot be deleted');
    }
    throw notFound('Problem not found');
  }
  await Promise.all(links.map((link) => invalidateScoreboard(link.contestId)));
}

interface TestSummaryRow {
  id: string;
  ordinal: number;
  isSample: boolean;
  explanation: string | null;
  inputBytes: number;
  expectedOutputBytes: number;
  inputPreview: string;
  expectedOutputPreview: string;
}

/**
 * GET /:id/tests: sizes and previews computed in Postgres, so multi-MB inputs are never loaded.
 * octet_length counts UTF-8 bytes; left() counts characters.
 */
export async function listAdminTests(
  prisma: PrismaClient,
  problemId: string,
): Promise<AdminTestCaseSummary[]> {
  await assertProblem(prisma, problemId);
  const preview = LIMITS.testPreviewChars;
  const rows = await prisma.$queryRaw<TestSummaryRow[]>`
    SELECT id, ordinal, "isSample", explanation,
           octet_length(input)::int AS "inputBytes",
           octet_length("expectedOutput")::int AS "expectedOutputBytes",
           left(input, ${preview}::int) AS "inputPreview",
           left("expectedOutput", ${preview}::int) AS "expectedOutputPreview"
    FROM "TestCase"
    WHERE "problemId" = ${problemId}
    ORDER BY ordinal ASC`;
  return rows.map((row) => ({
    id: row.id,
    ordinal: Number(row.ordinal),
    isSample: row.isSample,
    explanation: row.explanation,
    inputBytes: Number(row.inputBytes),
    expectedOutputBytes: Number(row.expectedOutputBytes),
    inputPreview: row.inputPreview,
    expectedOutputPreview: row.expectedOutputPreview,
  }));
}

async function findTest(prisma: PrismaClient, problemId: string, testId: string) {
  const test = await prisma.testCase.findFirst({ where: { id: testId, problemId } });
  if (!test) throw notFound('Test case not found');
  return test;
}

export async function getAdminTest(
  prisma: PrismaClient,
  problemId: string,
  testId: string,
): Promise<AdminTestCase> {
  return toAdminTestCase(await findTest(prisma, problemId, testId));
}

async function nextOrdinal(
  db: Pick<PrismaClient, 'testCase'> | Prisma.TransactionClient,
  problemId: string,
): Promise<number> {
  const { _max } = await db.testCase.aggregate({ where: { problemId }, _max: { ordinal: true } });
  return (_max.ordinal ?? 0) + 1;
}

/** POST /:id/tests: ordinal omitted = after the last test; a taken ordinal is a 409 (P2002). */
export async function createAdminTest(
  prisma: PrismaClient,
  problemId: string,
  body: AdminTestBody,
): Promise<AdminTestCase> {
  await assertProblem(prisma, problemId);
  const row = await prisma.testCase.create({
    data: {
      problemId,
      ordinal: body.ordinal ?? (await nextOrdinal(prisma, problemId)),
      input: body.input,
      expectedOutput: body.expectedOutput,
      isSample: body.isSample,
      explanation: body.explanation ?? null,
    },
  });
  return toAdminTestCase(row);
}

/** PUT /:id/tests/:testId: full replace; the ordinal is kept when omitted. */
export async function updateAdminTest(
  prisma: PrismaClient,
  problemId: string,
  testId: string,
  body: AdminTestBody,
): Promise<AdminTestCase> {
  await findTest(prisma, problemId, testId);
  const row = await prisma.testCase.update({
    where: { id: testId },
    data: {
      input: body.input,
      expectedOutput: body.expectedOutput,
      isSample: body.isSample,
      explanation: body.explanation ?? null,
      ...(body.ordinal !== undefined ? { ordinal: body.ordinal } : {}),
    },
  });
  return toAdminTestCase(row);
}

export async function deleteAdminTest(
  prisma: PrismaClient,
  problemId: string,
  testId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const problem = await tx.problem.findUnique({
      where: { id: problemId },
      select: { isPublished: true },
    });
    if (problem?.isPublished && (await tx.testCase.count({ where: { problemId } })) <= 1) {
      const exists = await tx.testCase.count({ where: { id: testId, problemId } });
      if (exists) throw conflict('A published problem must keep at least one test case');
    }
    const { count } = await tx.testCase.deleteMany({ where: { id: testId, problemId } });
    if (count === 0) throw notFound('Test case not found');
  });
}

/**
 * POST /:id/tests/bulk: array order = ordinal order. replace=true deletes every existing test and
 * numbers the new ones from 1; otherwise they are appended after the last ordinal. One transaction.
 */
export async function bulkAdminTests(
  prisma: PrismaClient,
  problemId: string,
  body: BulkTestsBody,
): Promise<BulkTestsResponse> {
  await assertProblem(prisma, problemId);
  return prisma.$transaction(
    async (tx) => {
      if (body.replace) await tx.testCase.deleteMany({ where: { problemId } });
      const first = body.replace ? 1 : await nextOrdinal(tx, problemId);
      const { count } = await tx.testCase.createMany({
        data: body.tests.map((test, index) => ({
          problemId,
          ordinal: first + index,
          input: test.input,
          expectedOutput: test.expectedOutput,
          isSample: test.isSample,
          explanation: test.explanation ?? null,
        })),
      });
      const total = await tx.testCase.count({ where: { problemId } });
      return { created: count, total };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}
