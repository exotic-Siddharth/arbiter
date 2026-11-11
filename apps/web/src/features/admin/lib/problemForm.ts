import {
  AdminProblemBody,
  type AdminProblem,
  type CheckerType,
  type Difficulty,
  type Language,
} from '@arbiter/shared';
import { zodFieldErrors } from './zodErrors';

/** Editable problem fields as the form holds them (numbers stay strings while typing). */
export interface ProblemFormState {
  slug: string;
  title: string;
  statementMd: string;
  difficulty: Difficulty;
  timeLimitMs: string;
  memoryLimitMb: string;
  checker: CheckerType;
  floatTolerance: string;
  isPublished: boolean;
  /** Comma-separated. */
  tags: string;
}

export const EMPTY_PROBLEM_FORM: ProblemFormState = {
  slug: '',
  title: '',
  statementMd: '',
  difficulty: 'EASY',
  timeLimitMs: '1000',
  memoryLimitMb: '256',
  checker: 'TOKENS',
  floatTolerance: '',
  isPublished: false,
  tags: '',
};

export function problemToForm(problem: AdminProblem): ProblemFormState {
  return {
    slug: problem.slug,
    title: problem.title,
    statementMd: problem.statementMd,
    difficulty: problem.difficulty,
    timeLimitMs: String(problem.timeLimitMs),
    memoryLimitMb: String(problem.memoryLimitMb),
    checker: problem.checker,
    floatTolerance: problem.floatTolerance == null ? '' : String(problem.floatTolerance),
    isPublished: problem.isPublished,
    tags: problem.tags.join(', '),
  };
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(',')) {
    const tag = part.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** The reference solution travels with every full-replace PUT; the details form keeps it as is. */
export interface ProblemReference {
  referenceLanguage: Language | null;
  referenceSolution: string | null;
}

export function problemReference(problem: AdminProblem | undefined): ProblemReference {
  return {
    referenceLanguage: problem?.referenceLanguage ?? null,
    referenceSolution: problem?.referenceSolution ?? null,
  };
}

function toNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

export type ProblemFormResult =
  { ok: true; body: AdminProblemBody } | { ok: false; errors: Record<string, string> };

/** Form state -> AdminProblemBody, validated with the shared schema (field errors by name). */
export function problemFormToBody(
  form: ProblemFormState,
  reference: ProblemReference,
): ProblemFormResult {
  const parsed = AdminProblemBody.safeParse({
    slug: form.slug.trim(),
    title: form.title,
    statementMd: form.statementMd,
    difficulty: form.difficulty,
    timeLimitMs: toNumber(form.timeLimitMs),
    memoryLimitMb: toNumber(form.memoryLimitMb),
    checker: form.checker,
    floatTolerance: form.checker === 'FLOAT' ? toNumber(form.floatTolerance) : null,
    isPublished: form.isPublished,
    tags: parseTags(form.tags),
    referenceLanguage: reference.referenceLanguage,
    referenceSolution: reference.referenceSolution,
  });
  if (parsed.success) return { ok: true, body: parsed.data };
  const errors = zodFieldErrors(parsed.error);
  // NaN reaches zod as "expected number, received nan": say what is wanted instead.
  for (const key of ['timeLimitMs', 'memoryLimitMb', 'floatTolerance'] as const) {
    if (errors[key]?.toLowerCase().includes('nan')) errors[key] = 'Enter a number';
  }
  return { ok: false, errors };
}

/** The body of the PUT that saves `problem` again with a new reference solution. */
export function problemWithReference(
  problem: AdminProblem,
  reference: ProblemReference,
): AdminProblemBody {
  return AdminProblemBody.parse({
    slug: problem.slug,
    title: problem.title,
    statementMd: problem.statementMd,
    difficulty: problem.difficulty,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    checker: problem.checker,
    floatTolerance: problem.floatTolerance,
    isPublished: problem.isPublished,
    tags: problem.tags,
    referenceLanguage: reference.referenceLanguage,
    referenceSolution: reference.referenceSolution,
  });
}
