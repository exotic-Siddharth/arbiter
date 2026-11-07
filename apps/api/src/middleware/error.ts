import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, badRequest, conflict, internal, notFound, payloadTooLarge } from '../lib/errors';
import { logger } from '../lib/logger';
import { zodIssues } from './validate';

interface BodyParserError {
  type: string;
  status?: number;
  expose?: boolean;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { type?: unknown }).type === 'string' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

/** Maps anything thrown by a handler to an AppError. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return badRequest('Invalid data', zodIssues('body', error));
  }
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large' || error.status === 413) {
      return payloadTooLarge('Request body is too large');
    }
    if (error.type === 'entity.parse.failed') return badRequest('Malformed JSON body');
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
      return badRequest('Unreadable request body');
    }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation and "record to update/delete not found".
    if (error.code === 'P2002') {
      return conflict('A record with this value already exists', { target: error.meta?.target });
    }
    if (error.code === 'P2025') return notFound('Record not found');
  }
  return internal();
}

/** Last middleware: `{ error: { code, message, details? } }`. Stack traces never reach clients. */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const appError = toAppError(error);
  const log = req.log ?? logger;
  // 501 comes only from scaffold stubs: expected while lanes are in progress, not an incident.
  if (appError.status >= 500 && appError.code !== 'NOT_IMPLEMENTED') {
    log.error({ err: error }, 'request failed');
  }
  if (res.headersSent) {
    next(error);
    return;
  }
  if (appError.retryAfterSec !== undefined) {
    res.setHeader('Retry-After', String(appError.retryAfterSec));
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  });
};
