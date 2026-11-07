import { z } from 'zod';
import {
  CheckerTypeSchema,
  DifficultySchema,
  NonNegativeInt,
  PageQuery,
  UserProblemStatusSchema,
  optionalQueryString,
  optionalUpperEnum,
  pageSchema,
} from './common';

export const ProblemSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: DifficultySchema,
  tags: z.array(z.string()),
  /** acceptedCount / submissionCount, 0..1 (0 when there are no submissions). */
  acceptanceRate: z.number().min(0).max(1),
  submissionCount: NonNegativeInt,
  acceptedCount: NonNegativeInt,
  /** null for guests and for problems the user never submitted to. */
  userStatus: UserProblemStatusSchema.nullable(),
});
export type ProblemSummary = z.infer<typeof ProblemSummarySchema>;

export const ProblemSampleSchema = z.object({
  ordinal: z.number().int().positive(),
  input: z.string(),
  expectedOutput: z.string(),
  explanation: z.string().nullable(),
});
export type ProblemSample = z.infer<typeof ProblemSampleSchema>;

/** GET /api/problems/:slug and GET /api/contests/:slug/problems/:label (samples only, never hidden tests). */
export const ProblemDetailSchema = ProblemSummarySchema.extend({
  statementMd: z.string(),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  checker: CheckerTypeSchema,
  samples: z.array(ProblemSampleSchema),
  /** Present when the problem is served through a contest route. */
  contest: z.object({ slug: z.string(), label: z.string() }).optional(),
});
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

/** GET /api/problems?search&difficulty&tag&status&sort&page&pageSize */
export const ListProblemsQuery = PageQuery.extend({
  search: optionalQueryString(100),
  difficulty: optionalUpperEnum(DifficultySchema),
  tag: optionalQueryString(50),
  /** Only meaningful for signed-in users. */
  status: z.enum(['solved', 'attempted', 'unsolved']).optional(),
  sort: z.enum(['newest', 'difficulty', 'acceptance', 'title']).default('newest'),
});
export type ListProblemsQuery = z.infer<typeof ListProblemsQuery>;
export type ListProblemsQueryInput = z.input<typeof ListProblemsQuery>;

export const ProblemPageSchema = pageSchema(ProblemSummarySchema);
export type ProblemPage = z.infer<typeof ProblemPageSchema>;

/** GET /api/tags: published problems per tag. */
export const TagCountSchema = z.object({ name: z.string(), count: NonNegativeInt });
export type TagCount = z.infer<typeof TagCountSchema>;
export const TagListSchema = z.array(TagCountSchema);
