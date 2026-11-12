import { z } from 'zod';
import {
  Id,
  isPgText,
  IsoDateTime,
  LanguageSchema,
  NonNegativeInt,
  PageQuery,
  PG_TEXT_MESSAGE,
  SourceCodeSchema,
  SubmissionStatusSchema,
  VerdictSchema,
  booleanQuery,
  optionalQueryString,
  optionalUpperEnum,
  pageSchema,
} from './common';

export const SubmissionSummarySchema = z.object({
  id: Id,
  problem: z.object({ slug: z.string(), title: z.string() }),
  user: z.object({ username: z.string() }),
  language: LanguageSchema,
  status: SubmissionStatusSchema,
  verdict: VerdictSchema.nullable(),
  timeMs: z.number().int().nullable(),
  memoryKb: z.number().int().nullable(),
  testsPassed: NonNegativeInt,
  testsTotal: NonNegativeInt,
  /** Set only for in-window contest submissions. */
  contestSlug: z.string().nullable(),
  createdAt: IsoDateTime,
  judgedAt: IsoDateTime.nullable(),
});
export type SubmissionSummary = z.infer<typeof SubmissionSummarySchema>;

export const SubmissionTestResultSchema = z.object({
  ordinal: z.number().int().positive(),
  verdict: VerdictSchema,
  timeMs: NonNegativeInt,
  memoryKb: NonNegativeInt,
  isSample: z.boolean(),
});
export type SubmissionTestResult = z.infer<typeof SubmissionTestResultSchema>;

/** The first failing sample test (samples only; hidden tests never expose data). */
export const FailedSampleSchema = z.object({
  ordinal: z.number().int().positive(),
  input: z.string(),
  expectedOutput: z.string(),
  actualOutput: z.string(),
  stderr: z.string(),
});
export type FailedSample = z.infer<typeof FailedSampleSchema>;

/** GET /api/submissions/:id */
export const SubmissionDetailSchema = SubmissionSummarySchema.extend({
  /** Owner or admin only; null otherwise. */
  sourceCode: z.string().nullable(),
  /** Owner or admin only; null otherwise. */
  compileOutput: z.string().nullable(),
  results: z.array(SubmissionTestResultSchema),
  /** Owner or admin only; null otherwise. */
  failedSample: FailedSampleSchema.nullable(),
  /** Internal judge error details: admins only (omitted for everyone else). */
  errorMessage: z.string().nullable().optional(),
});
export type SubmissionDetail = z.infer<typeof SubmissionDetailSchema>;

/** POST /api/submissions (rate limit 6/min/user). */
export const CreateSubmissionBody = z.object({
  problemSlug: z.string().min(1).max(100).refine(isPgText, PG_TEXT_MESSAGE),
  language: LanguageSchema,
  sourceCode: SourceCodeSchema,
  contestSlug: z.string().min(1).max(100).refine(isPgText, PG_TEXT_MESSAGE).optional(),
});
export type CreateSubmissionBody = z.infer<typeof CreateSubmissionBody>;

/** 202 response of POST /api/submissions */
export const CreateSubmissionResponseSchema = z.object({ submission: SubmissionSummarySchema });
export type CreateSubmissionResponse = z.infer<typeof CreateSubmissionResponseSchema>;

/** GET /api/submissions?username&problemSlug&verdict&language&mine=true&page&pageSize */
export const ListSubmissionsQuery = PageQuery.extend({
  username: optionalQueryString(40),
  problemSlug: optionalQueryString(100),
  verdict: optionalUpperEnum(VerdictSchema),
  language: optionalUpperEnum(LanguageSchema),
  mine: booleanQuery.optional(),
});
export type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuery>;
export type ListSubmissionsQueryInput = z.input<typeof ListSubmissionsQuery>;

export const SubmissionPageSchema = pageSchema(SubmissionSummarySchema);
export type SubmissionPage = z.infer<typeof SubmissionPageSchema>;
