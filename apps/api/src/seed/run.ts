import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { hashPassword } from '../lib/password';
import { clock } from '../lib/time';
import { rateContest } from '../modules/contests/admin';
import { runPlagiarismReport } from '../modules/plagiarism/service';
import {
  assertHiddenTests,
  loadSeedProblems,
  problemsRoot,
  type SeedProblem,
  type SeedTest,
} from './problems';
import { chance, createRng, cuidLike, int, range, seedOf, shuffled, type Rng } from './rng';
import {
  simulateContest,
  simulatePractice,
  simulateRecent,
  type ContestAttempt,
  type FailKind,
  type Outcome,
  type PracticeAttempt,
  type PracticeProblem,
  type SimProblem,
  type SimUser,
} from './simulate';
import { breakSource, diversify, plagiarise, type SeedLanguage } from './variants';

/**
 * The seed (spec section 14): wipes the application tables and recreates the demo data
 * deterministically. Order: wipe, users, the 15 problems, three contests, historical submissions
 * (inserted directly with verdicts, never judged), problem counters (R7), ratings for the ended
 * contest through the real rateContest/computeRatingDeltas, and one plagiarism report produced by
 * the real winnowing code (runPlagiarismReport).
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** The demo accounts the seed creates (usernames; the passwords come from the environment). */
export const SEED_ADMIN = { username: 'admin', email: 'admin@arbiter.dev' } as const;
export const SEED_DEMO = { username: 'demo', email: 'demo@arbiter.dev' } as const;

const SYNTHETIC_NAMES = [
  'byte_baker',
  'null_ptr',
  'stack_surfer',
  'heap_hero',
  'loopy_lu',
  'mod_mango',
  'xor_fox',
  'dp_dragon',
  'graph_gnome',
  'bit_bard',
  'cache_cat',
  'tle_tiger',
  'segtree_sam',
  'kmp_kiwi',
  'dsu_dan',
  'binary_bee',
  'lazy_prop',
  'trie_tess',
  'greedy_gus',
  'sieve_sue',
  'pq_penguin',
  'two_pointer',
  'fenwick_finn',
  'dijk_dina',
  'topo_tom',
  'suffix_sky',
  'rmq_ryu',
  'zeta_zed',
  'mex_max',
  'knap_nia',
] as const;

interface ContestPlan {
  slug: string;
  title: string;
  descriptionMd: string;
  startsAt: Date;
  endsAt: Date;
  problems: string[];
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  rating: number;
  skill: number;
  createdAt: Date;
}

interface SubmissionRow {
  id: string;
  userId: string;
  problemId: string;
  contestId: string | null;
  language: SeedLanguage;
  sourceCode: string;
  status: 'DONE';
  verdict: Outcome;
  timeMs: number | null;
  memoryKb: number | null;
  testsPassed: number;
  testsTotal: number;
  compileOutput: string | null;
  createdAt: Date;
  judgedAt: Date;
}

interface ResultRow {
  id: string;
  submissionId: string;
  ordinal: number;
  verdict: 'AC' | 'WA' | 'TLE';
  timeMs: number;
  memoryKb: number;
  isSample: boolean;
  outputPreview: string | null;
  stderrPreview: string | null;
}

/** Problem folders that make up the contests (labels A, B, ... in this order). */
const ROUND_1 = [
  'rainfall-ledger',
  'tandem-kayaks',
  'postage-ways',
  'lantern-spacing',
  'night-ferries',
];
const WEEKLY = ['badge-collisions', 'nested-scrolls', 'flooded-archive', 'rising-towers'];
const ROUND_2 = ['kiln-scheduling', 'bridge-builders', 'assembly-order'];
/** Published practice problems that belong to no contest. */
const FREE_PRACTICE: Record<string, number> = {
  'average-pace': 170,
  'motif-search': 150,
  'sensor-ranges': 120,
};

/** The two deliberately plagiarised pairs of Arbiter Round #1 (renamed identifiers). */
interface PlantedPair {
  problem: string;
  language: SeedLanguage;
  original: { user: string; minute: number };
  copy: { user: string; minute: number };
  renames: Record<string, string>;
}

const PLANTED: PlantedPair[] = [
  {
    problem: 'tandem-kayaks',
    language: 'PYTHON',
    original: { user: 'dp_dragon', minute: 21.4 },
    copy: { user: 'kmp_kiwi', minute: 38.9 },
    renames: {
      main: 'solve',
      data: 'tokens',
      n: 'size',
      cap: 'limit',
      w: 'weights',
      pairs: 'count',
      best: 'top',
      i: 'lo',
      j: 'hi',
      s: 'total',
      DEBUG: 'VERBOSE',
    },
  },
  {
    problem: 'lantern-spacing',
    language: 'CPP',
    original: { user: 'graph_gnome', minute: 64.2 },
    copy: { user: 'bit_bard', minute: 83.6 },
    renames: {
      n: 'cnt',
      k: 'need',
      pos: 'coords',
      flags: 'mask',
      hooks: 'spots',
      xs: 'ys',
      reserved: 'locked',
      reservedXs: 'lockedYs',
      FAR: 'INF',
      nextRes: 'nextLocked',
      nxt: 'upcoming',
      hi: 'right',
      lo: 'left',
      can: 'feasible',
      g: 'gap',
      last: 'prev',
      count: 'placed',
      mid: 'center',
      i: 'idx',
      x: 'v',
    },
  },
];

const failuresOf = (problem: SeedProblem): FailKind[] => [
  ...(problem.wrongPy ? (['WA'] as const) : []),
  ...(problem.slowPy ? (['TLE'] as const) : []),
];

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Wipes every application table (never the migration history). */
async function wipe(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "PlagiarismPair", "PlagiarismReport", "AdminJob", "RatingChange", ' +
      '"SubmissionTestResult", "Submission", "ContestRegistration", "ContestProblem", "Contest", ' +
      '"ProblemTag", "Tag", "TestCase", "Problem", "RefreshToken", "User" RESTART IDENTITY CASCADE',
  );
}

async function insertInChunks<T>(
  rows: readonly T[],
  size: number,
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size) as T[]);
}

/** Per-test results for a judged submission: AC up to the failing test, then the failure (the judge stops there). */
function buildResults(
  rng: Rng,
  submissionId: string,
  problem: SeedProblem,
  language: SeedLanguage,
  verdict: Outcome,
): { rows: ResultRow[]; timeMs: number | null; memoryKb: number | null; passed: number } {
  if (verdict === 'CE') return { rows: [], timeMs: null, memoryKb: null, passed: 0 };
  const tests: SeedTest[] = problem.tests;
  let failAt = tests.length + 1;
  if (verdict === 'WA') failAt = int(rng, 3, tests.length);
  if (verdict === 'TLE') failAt = int(rng, Math.ceil(tests.length / 2), tests.length);
  const ratio = language === 'CPP' ? [0.01, 0.2] : [0.1, 0.9];
  const memory = language === 'CPP' ? [2_000, 30_000] : [9_000, 60_000];
  const rows: ResultRow[] = [];
  for (const test of tests) {
    if (test.ordinal > failAt) break;
    const failed = test.ordinal === failAt;
    const testVerdict: ResultRow['verdict'] = failed ? (verdict as 'WA' | 'TLE') : 'AC';
    const scale = test.isSample ? 0.2 : 0.4 + 0.6 * (test.ordinal / tests.length);
    rows.push({
      id: cuidLike(rng),
      submissionId,
      ordinal: test.ordinal,
      verdict: testVerdict,
      timeMs:
        testVerdict === 'TLE'
          ? problem.timeLimitMs * (language === 'CPP' ? 1 : 3)
          : Math.max(1, Math.round(problem.timeLimitMs * range(rng, ratio[0], ratio[1]) * scale)),
      memoryKb: int(rng, memory[0], memory[1]),
      isSample: test.isSample,
      outputPreview: test.isSample ? truncate(test.expectedOutput, 4096) : null,
      stderrPreview: null,
    });
  }
  const executed = rows.length;
  return {
    rows,
    timeMs: Math.max(...rows.map((r) => r.timeMs)),
    memoryKb: Math.max(...rows.map((r) => r.memoryKb)),
    passed: verdict === 'AC' ? tests.length : executed - 1,
  };
}

export interface SeedSummary {
  problems: number;
  users: number;
  contests: number;
  submissions: number;
  testCases: number;
  ratingChanges: number;
  plagiarismPairs: number;
}

export async function runSeed(log: (line: string) => void = console.log): Promise<SeedSummary> {
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to seed in production (at least 8 characters).',
    );
  }
  const root = problemsRoot();
  // Fail before any row is touched when a hidden test is missing.
  assertHiddenTests(root);
  const problems = loadSeedProblems(root);
  const bySlug = new Map(problems.map((p) => [p.slug, p]));
  for (const slug of [...ROUND_1, ...WEEKLY, ...ROUND_2, ...Object.keys(FREE_PRACTICE)]) {
    if (!bySlug.has(slug))
      throw new Error(`The seed plan refers to the problem "${slug}", which has no folder.`);
  }

  const now = clock.now();
  const rng = createRng(seedOf('arbiter-seed-v1'));
  log(`Seeding ${problems.length} problems from ${root}`);

  await wipe();

  // --- users -----------------------------------------------------------------------------
  const [adminHash, demoHash, syntheticHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(env.SEED_DEMO_PASSWORD),
    hashPassword(env.SEED_DEMO_PASSWORD),
  ]);
  const ranked = shuffled(rng, SYNTHETIC_NAMES);
  const synthetic: UserRow[] = ranked.map((username, i) => {
    const rating = 850 + 36 * i + int(rng, -20, 20);
    return {
      id: cuidLike(rng),
      username,
      email: `${username}@seed.arbiter.dev`,
      rating,
      skill: Math.min(1, Math.max(0.05, (rating - 850) / 1100)),
      createdAt: new Date(now.getTime() - int(rng, 190, 360) * DAY),
    };
  });
  const adminRow = { id: cuidLike(rng), ...SEED_ADMIN };
  const demoRow: UserRow = {
    id: cuidLike(rng),
    ...SEED_DEMO,
    rating: 1200,
    skill: 0.42,
    createdAt: new Date(now.getTime() - 200 * DAY),
  };
  await prisma.user.createMany({
    data: [
      {
        id: adminRow.id,
        email: adminRow.email,
        username: adminRow.username,
        usernameLower: adminRow.username.toLowerCase(),
        passwordHash: adminHash,
        role: 'ADMIN',
        bio: 'Arbiter administrator (seed account).',
        createdAt: new Date(now.getTime() - 365 * DAY),
      },
      {
        id: demoRow.id,
        email: demoRow.email,
        username: demoRow.username,
        usernameLower: demoRow.username.toLowerCase(),
        passwordHash: demoHash,
        rating: demoRow.rating,
        bio: 'Exploring the judge. This is the shared demo account.',
        createdAt: demoRow.createdAt,
      },
      ...synthetic.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        usernameLower: u.username.toLowerCase(),
        passwordHash: syntheticHash,
        rating: u.rating,
        createdAt: u.createdAt,
      })),
    ],
  });
  const userByName = new Map<string, UserRow>([
    [demoRow.username, demoRow],
    ...synthetic.map((u) => [u.username, u] as const),
  ]);

  // --- problems --------------------------------------------------------------------------
  const published = new Set([...ROUND_1, ...Object.keys(FREE_PRACTICE)]);
  const createdDaysAgo = (slug: string): number =>
    FREE_PRACTICE[slug] !== undefined
      ? FREE_PRACTICE[slug] + 10
      : ROUND_1.includes(slug)
        ? 30
        : WEEKLY.includes(slug)
          ? 3
          : 2;
  const tagNames = [...new Set(problems.flatMap((p) => p.tags))].sort();
  await prisma.tag.createMany({ data: tagNames.map((name) => ({ id: cuidLike(rng), name })) });
  const tagIds = new Map((await prisma.tag.findMany()).map((t) => [t.name, t.id]));
  const problemId = new Map<string, string>();
  let testCaseCount = 0;
  for (const problem of problems) {
    const id = cuidLike(rng);
    problemId.set(problem.slug, id);
    await prisma.problem.create({
      data: {
        id,
        slug: problem.slug,
        title: problem.title,
        statementMd: problem.statementMd,
        difficulty: problem.difficulty,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        checker: problem.checker,
        floatTolerance: problem.floatTolerance,
        isPublished: published.has(problem.slug),
        authorId: adminRow.id,
        referenceLanguage: 'CPP',
        referenceSolution: problem.refCpp,
        createdAt: new Date(now.getTime() - createdDaysAgo(problem.slug) * DAY),
        tags: {
          create: problem.tags.map((name) => ({ tag: { connect: { id: tagIds.get(name) } } })),
        },
      },
    });
    await insertInChunks(problem.tests, 4, (chunk) =>
      prisma.testCase.createMany({
        data: chunk.map((t) => ({
          problemId: id,
          ordinal: t.ordinal,
          input: t.input,
          expectedOutput: t.expectedOutput,
          isSample: t.isSample,
          explanation: t.explanation,
        })),
      }),
    );
    testCaseCount += problem.tests.length;
  }

  // --- contests --------------------------------------------------------------------------
  const round1End = new Date(now.getTime() - 7 * DAY);
  const plans: ContestPlan[] = [
    {
      slug: 'arbiter-round-1',
      title: 'Arbiter Round #1',
      descriptionMd:
        'The first rated round: five problems, two hours, ICPC scoring with a 20 minute penalty for every counted wrong attempt.\n\n' +
        'The round is over and ratings are applied. Every problem is open for practice.',
      startsAt: new Date(round1End.getTime() - 2 * HOUR),
      endsAt: round1End,
      problems: ROUND_1,
    },
    {
      slug: 'weekly-practice-arena',
      title: 'Weekly Practice Arena',
      descriptionMd:
        'A relaxed two-week arena with four problems. Register, pick a problem and submit as often as you like: the scoreboard is live.\n\n' +
        'Problems are published for practice after the arena closes.',
      startsAt: new Date(now.getTime() - HOUR),
      endsAt: new Date(now.getTime() + 14 * DAY),
      problems: WEEKLY,
    },
    {
      slug: 'arbiter-round-2',
      title: 'Arbiter Round #2',
      descriptionMd:
        'The second rated round: three problems of rising difficulty, two hours.\n\n' +
        'Registration is open. The problem set is revealed when the round starts.',
      startsAt: new Date(now.getTime() + 3 * DAY),
      endsAt: new Date(now.getTime() + 3 * DAY + 2 * HOUR),
      problems: ROUND_2,
    },
  ];
  const labels = 'ABCDE';
  const contestId = new Map<string, string>();
  for (const plan of plans) {
    const id = cuidLike(rng);
    contestId.set(plan.slug, id);
    await prisma.contest.create({
      data: {
        id,
        slug: plan.slug,
        title: plan.title,
        descriptionMd: plan.descriptionMd,
        startsAt: plan.startsAt,
        endsAt: plan.endsAt,
        isPublished: true,
        penaltyMinutes: 20,
        createdAt: new Date(plan.startsAt.getTime() - 14 * DAY),
        problems: {
          create: plan.problems.map((slug, ordinal) => ({
            problemId: problemId.get(slug) as string,
            label: labels[ordinal],
            ordinal,
          })),
        },
      },
    });
  }

  // Registrations: Round #1 and the arena register shortly before they start.
  const planted = new Set(PLANTED.flatMap((p) => [p.original.user, p.copy.user]));
  const optional = shuffled(
    rng,
    synthetic.filter((u) => !planted.has(u.username)),
  );
  const round1Users = [
    demoRow,
    ...synthetic.filter((u) => planted.has(u.username)),
    ...optional.slice(5),
  ];
  const weeklyUsers = [demoRow, ...shuffled(rng, synthetic).slice(0, 9)];
  const round2Users = shuffled(rng, synthetic).slice(0, 6);
  const registrations: Prisma.ContestRegistrationCreateManyInput[] = [];
  const registerAll = (slug: string, users: readonly UserRow[]) => {
    const plan = plans.find((p) => p.slug === slug) as ContestPlan;
    for (const user of users) {
      const early =
        slug === 'arbiter-round-2' ? int(rng, 1, 30) * HOUR : int(rng, 10, 3000) * MINUTE;
      registrations.push({
        contestId: contestId.get(slug) as string,
        userId: user.id,
        registeredAt:
          slug === 'weekly-practice-arena'
            ? new Date(plan.startsAt.getTime() - int(rng, 5, 600) * MINUTE)
            : new Date(Math.min(plan.startsAt.getTime() - early, now.getTime() - HOUR)),
      });
    }
  };
  registerAll('arbiter-round-1', round1Users);
  registerAll('weekly-practice-arena', weeklyUsers);
  registerAll('arbiter-round-2', round2Users);
  await prisma.contestRegistration.createMany({ data: registrations });

  // --- submission history ----------------------------------------------------------------
  const submissions: SubmissionRow[] = [];
  const results: ResultRow[] = [];
  const preference = new Map(
    [demoRow, ...synthetic].map(
      (u) => [u.username, chance(rng, 0.45) ? 'CPP' : ('PYTHON' as SeedLanguage)] as const,
    ),
  );
  const simProblem = (slug: string): SimProblem => {
    const problem = bySlug.get(slug) as SeedProblem;
    return { slug, difficulty: problem.difficulty, failures: failuresOf(problem) };
  };

  const addSubmission = (
    attempt: { user: string; problem: string; at: Date; outcome: Outcome },
    contest: string | null,
    forced?: { language: SeedLanguage; source: string },
  ): void => {
    const user = userByName.get(attempt.user) as UserRow;
    const problem = bySlug.get(attempt.problem) as SeedProblem;
    const srcRng = createRng(
      seedOf(`${attempt.user}/${attempt.problem}/${attempt.at.getTime()}/${attempt.outcome}`),
    );
    let language: SeedLanguage = 'PYTHON';
    let source: string;
    let compileOutput: string | null = null;
    if (forced) {
      language = forced.language;
      source = forced.source;
    } else if (attempt.outcome === 'AC') {
      language = preference.get(attempt.user) ?? 'PYTHON';
      source = diversify(language === 'CPP' ? problem.refCpp : problem.refPy, language, srcRng);
    } else if (attempt.outcome === 'WA') {
      source = diversify(problem.wrongPy as string, 'PYTHON', srcRng);
    } else if (attempt.outcome === 'TLE') {
      source = diversify(problem.slowPy as string, 'PYTHON', srcRng);
    } else {
      language = preference.get(attempt.user) ?? 'PYTHON';
      const broken = breakSource(
        language === 'CPP' ? problem.refCpp : problem.refPy,
        language,
        srcRng,
      );
      source = broken.source;
      compileOutput = broken.compileOutput;
    }
    const id = cuidLike(rng);
    const judged = buildResults(srcRng, id, problem, language, attempt.outcome);
    results.push(...judged.rows);
    submissions.push({
      id,
      userId: user.id,
      problemId: problemId.get(attempt.problem) as string,
      contestId: contest,
      language,
      sourceCode: source,
      status: 'DONE',
      verdict: attempt.outcome,
      timeMs: judged.timeMs,
      memoryKb: judged.memoryKb,
      testsPassed: judged.passed,
      testsTotal: problem.tests.length,
      compileOutput,
      createdAt: attempt.at,
      judgedAt: new Date(
        attempt.at.getTime() +
          (language === 'CPP' ? int(srcRng, 1800, 5200) : int(srcRng, 900, 3400)),
      ),
    });
  };

  const toSimUsers = (users: readonly UserRow[]): SimUser[] =>
    users.map((u) => ({ key: u.username, skill: u.skill }));
  const plantedCells = new Set(
    PLANTED.flatMap((p) => [`${p.original.user}/${p.problem}`, `${p.copy.user}/${p.problem}`]),
  );

  // Arbiter Round #1: simulated, plus the two planted plagiarised pairs.
  const round1 = plans[0];
  const round1Attempts: ContestAttempt[] = simulateContest(
    createRng(seedOf('round-1')),
    toSimUsers(round1Users),
    ROUND_1.map(simProblem),
    120,
  ).filter((a) => !plantedCells.has(`${a.user}/${a.problem}`));
  for (const attempt of round1Attempts) {
    addSubmission(
      { ...attempt, at: new Date(round1.startsAt.getTime() + attempt.minute * MINUTE) },
      contestId.get(round1.slug) as string,
    );
  }
  for (const pair of PLANTED) {
    const problem = bySlug.get(pair.problem) as SeedProblem;
    const base = pair.language === 'CPP' ? problem.refCpp : problem.refPy;
    const originalSource = diversify(
      base,
      pair.language,
      createRng(seedOf(`planted/${pair.problem}`)),
    );
    const copySource = plagiarise(
      originalSource,
      pair.language,
      pair.renames,
      createRng(seedOf(`copy/${pair.problem}`)),
    );
    for (const [side, source] of [
      [pair.original, originalSource],
      [pair.copy, copySource],
    ] as const) {
      addSubmission(
        {
          user: side.user,
          problem: pair.problem,
          at: new Date(round1.startsAt.getTime() + side.minute * MINUTE),
          outcome: 'AC',
        },
        contestId.get(round1.slug) as string,
        { language: pair.language, source },
      );
    }
  }

  // The Weekly Practice Arena has been running for an hour.
  const weekly = plans[1];
  const weeklyAttempts = simulateContest(
    createRng(seedOf('weekly')),
    toSimUsers(weeklyUsers),
    WEEKLY.map(simProblem),
    60,
    { from: 3, to: 58 },
  );
  for (const attempt of weeklyAttempts) {
    addSubmission(
      { ...attempt, at: new Date(weekly.startsAt.getTime() + attempt.minute * MINUTE) },
      contestId.get(weekly.slug) as string,
    );
  }

  // Practice history: published problems only, from the moment each one is open.
  const practiceProblems: PracticeProblem[] = [
    ...Object.entries(FREE_PRACTICE).map(([slug, days]) => ({
      ...simProblem(slug),
      availableFrom: new Date(now.getTime() - days * DAY),
    })),
    ...ROUND_1.map((slug) => ({
      ...simProblem(slug),
      availableFrom: new Date(round1End.getTime() + 20 * MINUTE),
    })),
  ];
  const practiceUsers = [
    { key: demoRow.username, skill: demoRow.skill, activeDays: 46 },
    ...synthetic.map((u) => ({ key: u.username, skill: u.skill })),
  ];
  const practice: PracticeAttempt[] = [
    ...simulatePractice(createRng(seedOf('practice')), practiceUsers, practiceProblems, {
      now: new Date(now.getTime() - 3 * HOUR),
      horizonDays: 175,
    }),
    ...simulateRecent(
      createRng(seedOf('recent')),
      toSimUsers(synthetic),
      practiceProblems,
      now,
      14,
    ),
  ];
  for (const attempt of practice) addSubmission(attempt, null);

  await insertInChunks(submissions, 400, (chunk) => prisma.submission.createMany({ data: chunk }));
  await insertInChunks(results, 2000, (chunk) =>
    prisma.submissionTestResult.createMany({ data: chunk }),
  );

  // Problem counters (R7): NORMAL submissions that reached DONE, and the ACs among them.
  const counters = await prisma.submission.groupBy({
    by: ['problemId', 'verdict'],
    where: { kind: 'NORMAL', status: 'DONE' },
    _count: { _all: true },
  });
  const totals = new Map<string, { submissions: number; accepted: number }>();
  for (const row of counters) {
    const entry = totals.get(row.problemId) ?? { submissions: 0, accepted: 0 };
    entry.submissions += row._count._all;
    if (row.verdict === 'AC') entry.accepted += row._count._all;
    totals.set(row.problemId, entry);
  }
  for (const [id, entry] of totals) {
    await prisma.problem.update({
      where: { id },
      data: { submissionCount: entry.submissions, acceptedCount: entry.accepted },
    });
  }

  // --- ratings and the plagiarism report -------------------------------------------------
  const rated = await rateContest(prisma, contestId.get(round1.slug) as string);
  const ratedAt = new Date(round1End.getTime() + 10 * MINUTE);
  await prisma.ratingChange.updateMany({
    where: { contestId: contestId.get(round1.slug) as string },
    data: { createdAt: ratedAt },
  });
  await prisma.contest.update({
    where: { id: contestId.get(round1.slug) as string },
    data: { ratedAt },
  });

  const report = await prisma.plagiarismReport.create({
    data: { contestId: contestId.get(round1.slug) as string, threshold: 0.6 },
  });
  await runPlagiarismReport(report.id);
  const finished = await prisma.plagiarismReport.findUniqueOrThrow({
    where: { id: report.id },
    include: { _count: { select: { pairs: true } } },
  });
  if (finished.status !== 'DONE')
    throw new Error(
      `The seeded plagiarism report ended ${finished.status}: ${finished.error ?? ''}`,
    );
  const pairCount = finished._count.pairs;
  if (pairCount < PLANTED.length) {
    throw new Error(
      `The seeded plagiarism report found ${pairCount} pairs; expected at least ${PLANTED.length}.`,
    );
  }

  return {
    problems: problems.length,
    users: synthetic.length + 2,
    contests: plans.length,
    submissions: submissions.length,
    testCases: testCaseCount,
    ratingChanges: rated.changes.length,
    plagiarismPairs: pairCount,
  };
}
