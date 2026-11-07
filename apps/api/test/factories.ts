import { hash } from '@node-rs/argon2';
import type {
  Contest,
  Prisma,
  PrismaClient,
  Problem,
  Submission,
  TestCase,
  User,
} from '@prisma/client';
import { signAccessToken } from '../src/lib/jwt';

/**
 * Test data factories. Every value that must be unique gets a fresh suffix, so tests can create
 * records without coordinating. Pass `overrides` for the fields a test cares about.
 */

let sequence = 0;
/** Short unique suffix: lower-case letters and digits only. */
export function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now().toString(36).slice(-5)}${sequence.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`;
}

/** The password of every factory user unless overridden. */
export const TEST_PASSWORD = 'correct-horse-battery';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }; // Argon2id, spec section 12

let testPasswordHash: Promise<string> | undefined;
/** Argon2id hash of TEST_PASSWORD (computed once per test file). */
export function hashedTestPassword(): Promise<string> {
  testPasswordHash ??= hash(TEST_PASSWORD, ARGON2_OPTIONS);
  return testPasswordHash;
}

export type UserOverrides = Partial<Prisma.UserUncheckedCreateInput> & { password?: string };

/** A USER (rating 1200) with password TEST_PASSWORD; `usernameLower` follows `username`. */
export async function createUser(
  prisma: PrismaClient,
  overrides: UserOverrides = {},
): Promise<User> {
  const { password, ...data } = overrides;
  const username = data.username ?? `u_${uniqueSuffix()}`;
  const passwordHash =
    data.passwordHash ??
    (password === undefined ? await hashedTestPassword() : await hash(password, ARGON2_OPTIONS));
  return prisma.user.create({
    data: {
      email: `${username.toLowerCase()}@example.test`,
      ...data,
      username,
      usernameLower: data.usernameLower ?? username.toLowerCase(),
      passwordHash,
    },
  });
}

export interface TestCaseSpec {
  input: string;
  expectedOutput: string;
  isSample?: boolean;
  explanation?: string | null;
}

/** "Print a + b": 2 samples followed by 3 hidden tests (ordinals 1..5). */
export const DEFAULT_TESTS: readonly TestCaseSpec[] = [
  { input: '1 2\n', expectedOutput: '3\n', isSample: true, explanation: '1 + 2 = 3.' },
  {
    input: '10 -4\n',
    expectedOutput: '6\n',
    isSample: true,
    explanation: 'Negative numbers work too.',
  },
  { input: '0 0\n', expectedOutput: '0\n' },
  { input: '1000000000 1000000000\n', expectedOutput: '2000000000\n' },
  { input: '-7 3\n', expectedOutput: '-4\n' },
];

export type ProblemOverrides = Omit<
  Partial<Prisma.ProblemUncheckedCreateInput>,
  'tags' | 'testCases'
> & {
  /** Replaces DEFAULT_TESTS. Ordinals follow array order. */
  tests?: readonly TestCaseSpec[];
  /** Tag names (created if missing). */
  tags?: string[];
};

export type ProblemWithTests = Problem & { testCases: TestCase[] };

/** A published EASY problem with DEFAULT_TESTS (2 sample + 3 hidden tests). */
export async function createProblem(
  prisma: PrismaClient,
  overrides: ProblemOverrides = {},
): Promise<ProblemWithTests> {
  const { tests = DEFAULT_TESTS, tags = [], ...data } = overrides;
  const suffix = uniqueSuffix();
  return prisma.problem.create({
    data: {
      slug: `sum-${suffix}`,
      title: `Sum ${suffix}`,
      statementMd: 'Read two integers $a$ and $b$ and print $a + b$.',
      difficulty: 'EASY',
      isPublished: true,
      ...data,
      testCases: {
        create: tests.map((test, index) => ({
          ordinal: index + 1,
          input: test.input,
          expectedOutput: test.expectedOutput,
          isSample: test.isSample ?? false,
          explanation: test.explanation ?? null,
        })),
      },
      tags: {
        create: tags.map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
    include: { testCases: { orderBy: { ordinal: 'asc' } } },
  });
}

export type ContestOverrides = Omit<
  Partial<Prisma.ContestUncheckedCreateInput>,
  'problems' | 'registrations'
> & {
  /** Problems in label order, e.g. [{ problemId: a.id, label: 'A' }]. */
  problems?: { problemId: string; label: string }[];
  /** User ids to register. */
  registrations?: string[];
};

/** A published contest that is running now (started 1 h ago, ends in 1 h), penalty 20 min. */
export async function createContest(
  prisma: PrismaClient,
  overrides: ContestOverrides = {},
): Promise<Contest> {
  const { problems = [], registrations = [], ...data } = overrides;
  const suffix = uniqueSuffix();
  const now = Date.now();
  return prisma.contest.create({
    data: {
      slug: `contest-${suffix}`,
      title: `Contest ${suffix}`,
      descriptionMd: 'A test contest.',
      startsAt: new Date(now - 60 * 60 * 1000),
      endsAt: new Date(now + 60 * 60 * 1000),
      isPublished: true,
      ...data,
      problems: {
        create: problems.map((problem, index) => ({
          problemId: problem.problemId,
          label: problem.label,
          ordinal: index + 1,
        })),
      },
      registrations: { create: registrations.map((userId) => ({ userId })) },
    },
  });
}

/** A NORMAL submission (QUEUED unless overridden). userId and problemId are required. */
export async function createSubmission(
  prisma: PrismaClient,
  overrides: Partial<Prisma.SubmissionUncheckedCreateInput> & { userId: string; problemId: string },
): Promise<Submission> {
  return prisma.submission.create({
    data: {
      language: 'PYTHON',
      sourceCode: 'a, b = map(int, input().split())\nprint(a + b)\n',
      ...overrides,
    },
  });
}

/** { Authorization: 'Bearer <access token>' } for supertest's .set(). */
export function authHeader(user: Pick<User, 'id' | 'username' | 'role'>): {
  Authorization: string;
} {
  return { Authorization: `Bearer ${signAccessToken(user)}` };
}
