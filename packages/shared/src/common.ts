import { z } from 'zod';
import { LIMITS } from './constants';

// ---------------------------------------------------------------------------
// Enums (mirror the Prisma enums in apps/api/prisma/schema.prisma)
// ---------------------------------------------------------------------------

export const RoleSchema = z.enum(['USER', 'ADMIN']);
export type Role = z.infer<typeof RoleSchema>;

export const DifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export type Difficulty = z.infer<typeof DifficultySchema>;
export const DIFFICULTY_IDS = DifficultySchema.options;

export const LanguageSchema = z.enum(['CPP', 'PYTHON', 'JAVA', 'JAVASCRIPT']);
export type Language = z.infer<typeof LanguageSchema>;
export const LANGUAGE_IDS = LanguageSchema.options;

export const SubmissionStatusSchema = z.enum(['QUEUED', 'COMPILING', 'RUNNING', 'DONE', 'FAILED']);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const VerdictSchema = z.enum(['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'OLE', 'IE']);
export type Verdict = z.infer<typeof VerdictSchema>;
export const VERDICT_IDS = VerdictSchema.options;

export const CheckerTypeSchema = z.enum(['TOKENS', 'EXACT', 'FLOAT']);
export type CheckerType = z.infer<typeof CheckerTypeSchema>;

export const SubmissionKindSchema = z.enum(['NORMAL', 'REFERENCE']);
export type SubmissionKind = z.infer<typeof SubmissionKindSchema>;

export const JobStatusSchema = z.enum(['PENDING', 'RUNNING', 'DONE', 'FAILED']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Derived from startsAt/endsAt: RUNNING while startsAt <= now < endsAt. */
export const ContestStatusSchema = z.enum(['UPCOMING', 'RUNNING', 'ENDED']);
export type ContestStatus = z.infer<typeof ContestStatusSchema>;

/** The signed-in user's relation to a problem (null = never submitted, or guest). */
export const UserProblemStatusSchema = z.enum(['SOLVED', 'ATTEMPTED']);
export type UserProblemStatus = z.infer<typeof UserProblemStatusSchema>;

/** Raw status of a custom-input run (spec section 10, RunResult). */
export const RunStatusSchema = z.enum(['OK', 'CE', 'RE', 'TLE', 'MLE', 'OLE', 'IE']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp, e.g. new Date().toISOString(). */
export const IsoDateTime = z.string().datetime({ offset: true });

/** UTC calendar day, "YYYY-MM-DD". */
export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** Postgres text cannot hold U+0000; reject it at the zod level instead of as a database error. */
export const hasNul = (value: string) => value.includes(String.fromCharCode(0));

/** String.prototype.isWellFormed (ES2024, Node 20+, current browsers); the ES2023 lib lacks its type. */
const isWellFormed = (value: string) =>
  (value as string & { isWellFormed(): boolean }).isWellFormed();

/**
 * Text Postgres can store: no U+0000 and well-formed UTF-16. A lone surrogate has no UTF-8 form,
 * so Prisma would reject the query; every input string reaching the database is refined with this.
 */
export const isPgText = (value: string) => !hasNul(value) && isWellFormed(value);
export const PG_TEXT_MESSAGE = 'Must not contain NUL characters or unpaired surrogates';

/** Database id (cuid). Kept lenient so unknown ids give 404, not 400. */
export const Id = z.string().min(1).max(64).refine(isPgText, PG_TEXT_MESSAGE);

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug when creating or editing a problem/contest. */
export const SlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(SLUG_PATTERN, 'Use lower-case letters, digits and single hyphens');

export const NonNegativeInt = z.number().int().nonnegative();

const textEncoder = new TextEncoder();

/** Length of a string in UTF-8 bytes (what the byte limits in the spec count). */
export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

function formatLimit(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KB`;
  return `${bytes} bytes`;
}

/**
 * A string limited by UTF-8 byte length (resolution R18: refinement on TextEncoder output, not .max()).
 * `minChars` rejects empty strings when set to 1.
 */
export function stringWithMaxBytes(maxBytes: number, label: string, minChars = 0) {
  const base = minChars > 0 ? z.string().min(minChars, `${label} is required`) : z.string();
  return base
    .refine((value) => utf8ByteLength(value) <= maxBytes, {
      message: `${label} must be at most ${formatLimit(maxBytes)} (UTF-8)`,
    })
    .refine(isPgText, PG_TEXT_MESSAGE);
}

/** Submitted source code: 1 character up to 64 KB of UTF-8. */
export const SourceCodeSchema = stringWithMaxBytes(LIMITS.sourceCodeBytes, 'Source code', 1);

/** Custom run input: may be empty, at most 64 KB of UTF-8. */
export const RunInputSchema = stringWithMaxBytes(LIMITS.runInputBytes, 'Input');

/** Test-case input / expected output: at most 4 MB of UTF-8. */
export const TestDataSchema = (label: string) => stringWithMaxBytes(LIMITS.testDataBytes, label);

// ---------------------------------------------------------------------------
// Query-string helpers (Express 5 query values are strings or string arrays)
// ---------------------------------------------------------------------------

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Optional trimmed string; "" and whitespace become undefined. */
export const optionalQueryString = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max).refine(isPgText, PG_TEXT_MESSAGE).optional(),
  );

/** Optional enum that also accepts lower-case input ("easy" -> "EASY"); "" becomes undefined. */
export const optionalUpperEnum = <T extends [string, ...string[]]>(schema: z.ZodEnum<T>) =>
  z.preprocess((value) => {
    const v = emptyToUndefined(value);
    return typeof v === 'string' ? v.toUpperCase() : v;
  }, schema.optional());

/** "true"/"false" query flag. z.coerce.boolean() would turn "false" into true. */
export const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** ?page=1&pageSize=20 (page up to LIMITS.pageMax, pageSize max 100). */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).max(LIMITS.pageMax).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** Paged response: { items, total, page, pageSize }. */
export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: NonNegativeInt,
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Path params
// ---------------------------------------------------------------------------

export const IdParams = z.object({ id: Id });
export type IdParams = z.infer<typeof IdParams>;

export const SlugParams = z.object({
  slug: z.string().min(1).max(100).refine(isPgText, PG_TEXT_MESSAGE),
});
export type SlugParams = z.infer<typeof SlugParams>;

export const UsernameParams = z.object({
  username: z.string().min(1).max(40).refine(isPgText, PG_TEXT_MESSAGE),
});
export type UsernameParams = z.infer<typeof UsernameParams>;

export const RunIdParams = z.object({
  runId: z.string().min(1).max(64).refine(isPgText, PG_TEXT_MESSAGE),
});
export type RunIdParams = z.infer<typeof RunIdParams>;

export const ContestProblemParams = z.object({
  slug: z.string().min(1).max(100).refine(isPgText, PG_TEXT_MESSAGE),
  label: z.string().regex(/^[A-Za-z]{1,2}$/, 'Expected a problem label such as A'),
});
export type ContestProblemParams = z.infer<typeof ContestProblemParams>;

export const ProblemTestParams = z.object({ id: Id, testId: Id });
export type ProblemTestParams = z.infer<typeof ProblemTestParams>;

// ---------------------------------------------------------------------------
// Errors: { error: { code, message, details? } }
// ---------------------------------------------------------------------------

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
  // Only returned by scaffold stubs that a lane has not implemented yet.
  'NOT_IMPLEMENTED',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** `details` of a VALIDATION_ERROR: one entry per failed field. */
export const ValidationIssueSchema = z.object({
  location: z.enum(['body', 'query', 'params']),
  /** Dot-joined field path, e.g. "username" or "tests.3.input" ("" = the whole value). */
  path: z.string(),
  message: z.string(),
  code: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export const ValidationErrorDetailsSchema = z.array(ValidationIssueSchema);

/** `details` of a RATE_LIMITED error (the Retry-After header carries the same number). */
export const RateLimitedDetailsSchema = z.object({ retryAfterSec: z.number().int().positive() });
export type RateLimitedDetails = z.infer<typeof RateLimitedDetailsSchema>;

/** Body of GET /readyz. */
export const ReadinessSchema = z.object({
  ok: z.boolean(),
  db: z.enum(['up', 'down']),
  redis: z.enum(['up', 'down']),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export const HealthSchema = z.object({ ok: z.literal(true) });
