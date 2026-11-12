import { z } from 'zod';
import {
  isPgText,
  LanguageSchema,
  NonNegativeInt,
  PG_TEXT_MESSAGE,
  RunInputSchema,
  RunStatusSchema,
  SourceCodeSchema,
} from './common';

/** Result of a custom-input run (Redis run:<runId>, 10 min TTL; also socket event run:result). */
export const RunResultSchema = z.object({
  runId: z.string(),
  status: RunStatusSchema,
  /** At most 64 KB is shown. */
  stdout: z.string(),
  /** Last 2 KB. */
  stderr: z.string(),
  compileOutput: z.string().nullable(),
  timeMs: NonNegativeInt,
  memoryKb: NonNegativeInt,
});
export type RunResult = z.infer<typeof RunResultSchema>;

/** POST /api/runs (rate limit 12/min/user). problemSlug only selects the time/memory limits. */
export const CreateRunBody = z.object({
  language: LanguageSchema,
  sourceCode: SourceCodeSchema,
  input: RunInputSchema,
  problemSlug: z.string().min(1).max(100).refine(isPgText, PG_TEXT_MESSAGE).optional(),
});
export type CreateRunBody = z.infer<typeof CreateRunBody>;

/** 202 response of POST /api/runs */
export const CreateRunResponseSchema = z.object({ runId: z.string() });
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;

/** GET /api/runs/:runId (owner only) */
export const RunStatusResponseSchema = z.object({
  status: z.enum(['PENDING', 'DONE']),
  result: RunResultSchema.optional(),
});
export type RunStatusResponse = z.infer<typeof RunStatusResponseSchema>;
