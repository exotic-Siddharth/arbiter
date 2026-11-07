import type { ValidationIssue } from '@arbiter/shared';
import type { RequestHandler } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** ZodError -> VALIDATION_ERROR details (one entry per issue). */
export function zodIssues(
  location: ValidationIssue['location'],
  error: ZodError,
): ValidationIssue[] {
  return error.issues.map((issue) => ({
    location,
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function summarize(issues: ValidationIssue[]): string {
  const first = issues[0];
  if (!first) return 'Invalid request';
  const where = first.path ? `${first.path}: ` : '';
  const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : '';
  return `Invalid request: ${where}${first.message}${more}`;
}

/**
 * Validates and replaces req.params and req.body, and stores the parsed query in
 * req.validatedQuery (Express 5 req.query is read-only). 400 VALIDATION_ERROR with
 * details: ValidationIssue[] on failure.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const parsed: { body?: unknown; query?: unknown; params?: unknown } = {};

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) parsed[location] = result.data;
      else issues.push(...zodIssues(location, result.error));
    }

    if (issues.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', summarize(issues), issues);
    }
    if (schemas.params) req.params = parsed.params as typeof req.params;
    if (schemas.query) req.validatedQuery = parsed.query;
    if (schemas.body) req.body = parsed.body;
    next();
  };
}
