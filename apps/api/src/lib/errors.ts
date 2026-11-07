import type { ErrorCode } from '@arbiter/shared';

/**
 * An error with an HTTP status and an API error code. The error middleware turns it into
 * `{ error: { code, message, details? } }` (spec section 10).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  /** For 429 responses: seconds sent in the Retry-After header. */
  readonly retryAfterSec?: number;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSec = retryAfterSec;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** 400 VALIDATION_ERROR */
export const badRequest = (message = 'Invalid request', details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

/** 401 UNAUTHORIZED */
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

/** 403 FORBIDDEN */
export const forbidden = (message = 'You do not have permission to do this') =>
  new AppError(403, 'FORBIDDEN', message);

/** 404 NOT_FOUND */
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

/** 409 CONFLICT */
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

/** 429 RATE_LIMITED; sets Retry-After when retryAfterSec is given. */
export const tooMany = (message = 'Too many requests', retryAfterSec?: number) =>
  new AppError(
    429,
    'RATE_LIMITED',
    message,
    retryAfterSec === undefined ? undefined : { retryAfterSec },
    retryAfterSec,
  );

/** 413 PAYLOAD_TOO_LARGE */
export const payloadTooLarge = (message = 'Request body is too large') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);

/** 500 INTERNAL (the message is shown to clients: keep it generic). */
export const internal = (message = 'Internal server error') =>
  new AppError(500, 'INTERNAL', message);

/** 501 NOT_IMPLEMENTED: scaffold stubs only. */
export const notImplementedError = (what: string) =>
  new AppError(501, 'NOT_IMPLEMENTED', `Not implemented: ${what}`);
