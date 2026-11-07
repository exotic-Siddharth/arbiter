import { z } from 'zod';
import {
  CheckerTypeSchema,
  ContestStatusSchema,
  DifficultySchema,
  Id,
  IsoDateTime,
  JobStatusSchema,
  LanguageSchema,
  NonNegativeInt,
  PageQuery,
  RoleSchema,
  SlugSchema,
  SourceCodeSchema,
  TestDataSchema,
  optionalQueryString,
  pageSchema,
} from './common';
import { LIMITS } from './constants';

// ---------------------------------------------------------------------------
// Problems: /api/admin/problems
// ---------------------------------------------------------------------------

/** POST /api/admin/problems and PUT /api/admin/problems/:id (full replace). */
export const AdminProblemBody = z
  .object({
    slug: SlugSchema,
    title: z.string().trim().min(1).max(120),
    statementMd: z.string().min(1).max(100_000),
    difficulty: DifficultySchema,
    timeLimitMs: z.number().int().min(100).max(10_000),
    memoryLimitMb: z.number().int().min(16).max(1024),
    checker: CheckerTypeSchema.default('TOKENS'),
    /** Required when checker = FLOAT (absolute OR relative tolerance, e.g. 1e-6). */
    floatTolerance: z.number().positive().max(1).nullable().optional(),
    isPublished: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    referenceLanguage: LanguageSchema.nullable().optional(),
    referenceSolution: SourceCodeSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.checker === 'FLOAT' && value.floatTolerance == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['floatTolerance'],
        message: 'floatTolerance is required when checker is FLOAT',
      });
    }
    if (value.referenceSolution != null && value.referenceLanguage == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceLanguage'],
        message: 'referenceLanguage is required with a reference solution',
      });
    }
  });
export type AdminProblemBody = z.infer<typeof AdminProblemBody>;
export type AdminProblemBodyInput = z.input<typeof AdminProblemBody>;

export const AdminProblemSchema = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  statementMd: z.string(),
  difficulty: DifficultySchema,
  timeLimitMs: z.number().int(),
  memoryLimitMb: z.number().int(),
  checker: CheckerTypeSchema,
  floatTolerance: z.number().nullable(),
  isPublished: z.boolean(),
  tags: z.array(z.string()),
  referenceLanguage: LanguageSchema.nullable(),
  referenceSolution: z.string().nullable(),
  testCount: NonNegativeInt,
  sampleCount: NonNegativeInt,
  submissionCount: NonNegativeInt,
  acceptedCount: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminProblem = z.infer<typeof AdminProblemSchema>;

export const AdminProblemSummarySchema = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  difficulty: DifficultySchema,
  isPublished: z.boolean(),
  tags: z.array(z.string()),
  testCount: NonNegativeInt,
  submissionCount: NonNegativeInt,
  acceptedCount: NonNegativeInt,
  hasReference: z.boolean(),
  updatedAt: IsoDateTime,
});
export type AdminProblemSummary = z.infer<typeof AdminProblemSummarySchema>;

/** GET /api/admin/problems?search&page&pageSize (includes unpublished problems). */
export const AdminProblemListQuery = PageQuery.extend({ search: optionalQueryString(100) });
export type AdminProblemListQuery = z.infer<typeof AdminProblemListQuery>;
export const AdminProblemPageSchema = pageSchema(AdminProblemSummarySchema);
export type AdminProblemPage = z.infer<typeof AdminProblemPageSchema>;

// ---------------------------------------------------------------------------
// Test cases: /api/admin/problems/:id/tests (JSON body limit 20 MB on these routes)
// ---------------------------------------------------------------------------

const TestExplanationSchema = z.string().max(20_000).nullable().optional();

/** POST /api/admin/problems/:id/tests and PUT /api/admin/problems/:id/tests/:testId */
export const AdminTestBody = z.object({
  input: TestDataSchema('Input'),
  expectedOutput: TestDataSchema('Expected output'),
  isSample: z.boolean().default(false),
  /** Markdown, samples only. */
  explanation: TestExplanationSchema,
  /** 1-based; omitted on create = append after the last test. */
  ordinal: z.number().int().min(1).max(1000).optional(),
});
export type AdminTestBody = z.infer<typeof AdminTestBody>;
export type AdminTestBodyInput = z.input<typeof AdminTestBody>;

/** Full test case (single-test GET/POST/PUT responses). */
export const AdminTestCaseSchema = z.object({
  id: Id,
  problemId: Id,
  ordinal: z.number().int().positive(),
  input: z.string(),
  expectedOutput: z.string(),
  isSample: z.boolean(),
  explanation: z.string().nullable(),
});
export type AdminTestCase = z.infer<typeof AdminTestCaseSchema>;

/** Row of GET /api/admin/problems/:id/tests: sizes plus short previews, not the full data. */
export const AdminTestCaseSummarySchema = z.object({
  id: Id,
  ordinal: z.number().int().positive(),
  isSample: z.boolean(),
  explanation: z.string().nullable(),
  inputBytes: NonNegativeInt,
  expectedOutputBytes: NonNegativeInt,
  /** First LIMITS.testPreviewChars characters. */
  inputPreview: z.string(),
  expectedOutputPreview: z.string(),
});
export type AdminTestCaseSummary = z.infer<typeof AdminTestCaseSummarySchema>;
export const AdminTestListSchema = z.array(AdminTestCaseSummarySchema);

/** POST /api/admin/problems/:id/tests/bulk: array order = ordinal order; replace=true deletes existing tests first. */
export const BulkTestsBody = z.object({
  tests: z
    .array(
      z.object({
        input: TestDataSchema('Input'),
        expectedOutput: TestDataSchema('Expected output'),
        isSample: z.boolean().default(false),
        explanation: TestExplanationSchema,
      }),
    )
    .min(1)
    .max(LIMITS.bulkTestsMax),
  replace: z.boolean().default(false),
});
export type BulkTestsBody = z.infer<typeof BulkTestsBody>;
export type BulkTestsBodyInput = z.input<typeof BulkTestsBody>;

export const BulkTestsResponseSchema = z.object({
  /** Tests created by this request. */
  created: NonNegativeInt,
  /** Tests the problem has now. */
  total: NonNegativeInt,
});
export type BulkTestsResponse = z.infer<typeof BulkTestsResponseSchema>;

// ---------------------------------------------------------------------------
// Judge: reference validation, output generation, admin jobs, monitor
// ---------------------------------------------------------------------------

/** POST /api/admin/problems/:id/validate-reference: watch it like any submission. */
export const ValidateReferenceResponseSchema = z.object({ submissionId: Id });
export type ValidateReferenceResponse = z.infer<typeof ValidateReferenceResponseSchema>;

/** POST /api/admin/problems/:id/generate-outputs */
export const GenerateOutputsResponseSchema = z.object({ jobId: Id });
export type GenerateOutputsResponse = z.infer<typeof GenerateOutputsResponseSchema>;

/** GET /api/admin/jobs/:id */
export const AdminJobSchema = z.object({
  id: Id,
  /** "GENERATE_OUTPUTS" */
  type: z.string(),
  status: JobStatusSchema,
  /** Tests done so far. */
  progress: NonNegativeInt,
  total: NonNegativeInt,
  error: z.string().nullable(),
});
export type AdminJob = z.infer<typeof AdminJobSchema>;

/** BullMQ getJobCounts() subset. */
export const QueueCountsSchema = z.object({
  waiting: NonNegativeInt,
  active: NonNegativeInt,
  completed: NonNegativeInt,
  failed: NonNegativeInt,
  delayed: NonNegativeInt,
});
export type QueueCounts = z.infer<typeof QueueCountsSchema>;

export const JudgeWorkerSchema = z.object({
  id: z.string(),
  startedAt: IsoDateTime,
  lastSeen: IsoDateTime,
  concurrency: NonNegativeInt,
  processed: NonNegativeInt,
});
export type JudgeWorker = z.infer<typeof JudgeWorkerSchema>;

/** GET /api/admin/judge */
export const JudgeStatusSchema = z.object({
  queues: z.object({
    judge: QueueCountsSchema,
    run: QueueCountsSchema,
    plagiarism: QueueCountsSchema,
  }),
  workers: z.array(JudgeWorkerSchema),
  /** Queue-to-verdict latency over recent submissions; nulls when there is no sample. */
  latency: z.object({
    p50Ms: z.number().nonnegative().nullable(),
    p95Ms: z.number().nonnegative().nullable(),
    sample: NonNegativeInt,
  }),
  /** Last 30 minutes, oldest first; minute = ISO start of the minute. */
  throughputPerMin: z.array(z.object({ minute: IsoDateTime, count: NonNegativeInt })),
});
export type JudgeStatus = z.infer<typeof JudgeStatusSchema>;

// ---------------------------------------------------------------------------
// Contests: /api/admin/contests
// ---------------------------------------------------------------------------

export const ContestLabelSchema = z
  .string()
  .regex(/^[A-Z]{1,2}$/, 'Labels are one or two upper-case letters, e.g. A');

/** POST /api/admin/contests and PUT /api/admin/contests/:id (full replace). */
export const AdminContestBody = z
  .object({
    slug: SlugSchema,
    title: z.string().trim().min(1).max(120),
    descriptionMd: z.string().max(50_000).default(''),
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    isPublished: z.boolean().default(false),
    penaltyMinutes: z.number().int().min(0).max(240).default(20),
    /** Array order = problem ordinal. */
    problems: z
      .array(z.object({ problemId: Id, label: ContestLabelSchema }))
      .max(26)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
      });
    }
    const labels = new Set<string>();
    const problemIds = new Set<string>();
    value.problems.forEach((problem, index) => {
      if (labels.has(problem.label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['problems', index, 'label'],
          message: `Duplicate label ${problem.label}`,
        });
      }
      if (problemIds.has(problem.problemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['problems', index, 'problemId'],
          message: 'The same problem is listed twice',
        });
      }
      labels.add(problem.label);
      problemIds.add(problem.problemId);
    });
  });
export type AdminContestBody = z.infer<typeof AdminContestBody>;
export type AdminContestBodyInput = z.input<typeof AdminContestBody>;

export const AdminContestProblemSchema = z.object({
  problemId: Id,
  label: z.string(),
  ordinal: z.number().int(),
  slug: z.string(),
  title: z.string(),
});
export type AdminContestProblem = z.infer<typeof AdminContestProblemSchema>;

export const AdminContestSchema = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  descriptionMd: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  isPublished: z.boolean(),
  penaltyMinutes: NonNegativeInt,
  ratedAt: IsoDateTime.nullable(),
  status: ContestStatusSchema,
  participantCount: NonNegativeInt,
  problems: z.array(AdminContestProblemSchema),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AdminContest = z.infer<typeof AdminContestSchema>;

export const AdminContestSummarySchema = z.object({
  id: Id,
  slug: z.string(),
  title: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  status: ContestStatusSchema,
  isPublished: z.boolean(),
  problemCount: NonNegativeInt,
  participantCount: NonNegativeInt,
  ratedAt: IsoDateTime.nullable(),
});
export type AdminContestSummary = z.infer<typeof AdminContestSummarySchema>;

/** GET /api/admin/contests?search&page&pageSize */
export const AdminContestListQuery = PageQuery.extend({ search: optionalQueryString(100) });
export type AdminContestListQuery = z.infer<typeof AdminContestListQuery>;
export const AdminContestPageSchema = pageSchema(AdminContestSummarySchema);
export type AdminContestPage = z.infer<typeof AdminContestPageSchema>;

export const RatingChangeItemSchema = z.object({
  username: z.string(),
  oldRating: z.number().int(),
  newRating: z.number().int(),
  rank: z.number().int().positive(),
});
export type RatingChangeItem = z.infer<typeof RatingChangeItemSchema>;

/** POST /api/admin/contests/:id/rate (409 if not ended or already rated). */
export const RateContestResponseSchema = z.object({ changes: z.array(RatingChangeItemSchema) });
export type RateContestResponse = z.infer<typeof RateContestResponseSchema>;

// ---------------------------------------------------------------------------
// Plagiarism: /api/admin/plagiarism
// ---------------------------------------------------------------------------

/** POST /api/admin/plagiarism (problemId omitted = every problem of the contest). */
export const CreatePlagiarismBody = z.object({
  contestId: Id,
  problemId: Id.optional(),
  threshold: z.number().min(0).max(1).default(0.6),
});
export type CreatePlagiarismBody = z.infer<typeof CreatePlagiarismBody>;
export type CreatePlagiarismBodyInput = z.input<typeof CreatePlagiarismBody>;

export const PlagiarismCreatedResponseSchema = z.object({ reportId: Id });
export type PlagiarismCreatedResponse = z.infer<typeof PlagiarismCreatedResponseSchema>;

/** GET /api/admin/plagiarism?contestId */
export const PlagiarismListQuery = z.object({ contestId: Id.optional() });
export type PlagiarismListQuery = z.infer<typeof PlagiarismListQuery>;

export const PlagiarismReportSummarySchema = z.object({
  id: Id,
  contestId: z.string().nullable(),
  contestSlug: z.string().nullable(),
  contestTitle: z.string().nullable(),
  problemId: z.string().nullable(),
  threshold: z.number(),
  status: JobStatusSchema,
  error: z.string().nullable(),
  pairCount: NonNegativeInt,
  createdAt: IsoDateTime,
  finishedAt: IsoDateTime.nullable(),
});
export type PlagiarismReportSummary = z.infer<typeof PlagiarismReportSummarySchema>;
export const PlagiarismReportListSchema = z.array(PlagiarismReportSummarySchema);

export const PlagiarismSideSchema = z.object({
  submissionId: Id,
  username: z.string(),
  language: LanguageSchema,
  sourceCode: z.string(),
  /** 1-based line numbers covered by matched fingerprints. */
  matchedLines: z.array(z.number().int().positive()),
});
export type PlagiarismSide = z.infer<typeof PlagiarismSideSchema>;

export const PlagiarismPairSchema = z.object({
  id: Id,
  problemId: Id,
  problemSlug: z.string(),
  problemTitle: z.string(),
  /** 0..1 */
  similarity: z.number().min(0).max(1),
  a: PlagiarismSideSchema,
  b: PlagiarismSideSchema,
});
export type PlagiarismPair = z.infer<typeof PlagiarismPairSchema>;

/** GET /api/admin/plagiarism/:id: pairs sorted by similarity, highest first. */
export const PlagiarismReportDetailSchema = PlagiarismReportSummarySchema.extend({
  pairs: z.array(PlagiarismPairSchema),
});
export type PlagiarismReportDetail = z.infer<typeof PlagiarismReportDetailSchema>;

// ---------------------------------------------------------------------------
// Users: /api/admin/users
// ---------------------------------------------------------------------------

export const AdminUserSchema = z.object({
  id: Id,
  username: z.string(),
  email: z.string(),
  role: RoleSchema,
  rating: z.number().int(),
  submissionCount: NonNegativeInt,
  createdAt: IsoDateTime,
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

/** GET /api/admin/users?search&page&pageSize (search matches username or email). */
export const AdminUserListQuery = PageQuery.extend({ search: optionalQueryString(100) });
export type AdminUserListQuery = z.infer<typeof AdminUserListQuery>;
export const AdminUserPageSchema = pageSchema(AdminUserSchema);
export type AdminUserPage = z.infer<typeof AdminUserPageSchema>;

/** PATCH /api/admin/users/:id */
export const PatchUserRoleBody = z.object({ role: RoleSchema });
export type PatchUserRoleBody = z.infer<typeof PatchUserRoleBody>;

export const AdminUserResponseSchema = z.object({ user: AdminUserSchema });
export type AdminUserResponse = z.infer<typeof AdminUserResponseSchema>;
