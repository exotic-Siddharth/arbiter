import type { ErrorCode, ValidationIssue } from '@arbiter/shared';
import type { z } from 'zod';

/**
 * Low-level HTTP helpers shared by the API client (lib/api.ts) and the auth store. Nothing in
 * here knows about access tokens or refreshing; use `api` from '@/lib/api' in features.
 */

/** ErrorCode from the API, plus client-side failures. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  retryAfter?: number;
}

/** Every failed request rejects with an ApiError (except aborts, which keep their AbortError). */
export class ApiError extends Error {
  /** HTTP status; 0 when the server could not be reached. */
  readonly status: number;
  readonly code: ApiErrorCode;
  /** `error.details` from the response, e.g. ValidationIssue[] for VALIDATION_ERROR. */
  readonly details: unknown;
  /** Seconds to wait (429: Retry-After header or details.retryAfterSec). */
  readonly retryAfter?: number;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.retryAfter = init.retryAfter;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;
/** Query-string parameters; undefined, null and '' are skipped, arrays repeat the key. */
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>;

/** A zod schema whose parsed output is T (the input type is irrelevant here). */
export type ResponseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/** '/problems' -> '/api/problems'; paths that already start with /api are kept. */
export function apiPath(path: string): string {
  if (path === '/api' || path.startsWith('/api/') || path.startsWith('/api?')) return path;
  return `/api${path.startsWith('/') ? '' : '/'}${path}`;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = apiPath(path);
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const values: readonly QueryValue[] = Array.isArray(raw) ? raw : [raw as QueryValue];
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  if (!qs) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

export interface SendOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  token?: string | null;
  query?: QueryParams;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/** fetch() with JSON encoding. Network failures become ApiError NETWORK_ERROR. */
export async function send(options: SendOptions): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (
      typeof options.body === 'string' ||
      options.body instanceof FormData ||
      options.body instanceof Blob ||
      options.body instanceof URLSearchParams
    ) {
      body = options.body;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  try {
    return await fetch(buildUrl(options.path, options.query), {
      method: options.method,
      headers,
      body,
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: "Can't reach the server. Check your connection and try again.",
    });
  }
}

/** Seconds from a Retry-After header (delta-seconds or an HTTP date). */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return undefined;
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    case 501:
      return 'NOT_IMPLEMENTED';
    default:
      return 'INTERNAL';
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Please log in to continue.';
  if (status === 403) return "You don't have permission to do this.";
  if (status === 404) return 'Not found.';
  if (status === 413) return 'The request is too large.';
  if (status === 429) return 'Too many requests.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is unavailable right now. Please try again shortly.';
  }
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'The request could not be completed.';
}

function retryAfterFromDetails(details: unknown): number | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const value = (details as { retryAfterSec?: unknown }).retryAfterSec;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Turns a non-2xx response into an ApiError, reading `{ error: { code, message, details } }`. */
export async function toApiError(response: Response): Promise<ApiError> {
  const headerRetry = parseRetryAfter(response.headers.get('Retry-After'));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const error = (body as { error?: unknown } | undefined)?.error;
  if (typeof error === 'object' && error !== null) {
    const { code, message, details } = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    if (typeof code === 'string' && typeof message === 'string') {
      return new ApiError({
        status: response.status,
        code: code as ApiErrorCode,
        message,
        details,
        retryAfter: headerRetry ?? retryAfterFromDetails(details),
      });
    }
  }
  return new ApiError({
    status: response.status,
    code: codeForStatus(response.status),
    message: messageForStatus(response.status),
    retryAfter: headerRetry,
  });
}

/** Parses a response: throws ApiError for non-2xx, returns undefined for empty bodies. */
export async function parseResponse<T>(response: Response, schema?: ResponseSchema<T>): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  const text = response.status === 204 ? '' : await response.text();
  if (!text) return undefined as T;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The server sent an unreadable response.',
    });
  }
  if (!schema) return data as T;

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.error(
        '[api] response does not match the shared schema',
        response.url,
        parsed.error.issues,
      );
    }
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The server sent an unexpected response.',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

/** Formats seconds for messages: 37 -> "37 s", 125 -> "2 min 5 s". */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** A human-readable message for any error (ApiError, Error or unknown). */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiError(error)) {
    if (error.code === 'RATE_LIMITED' && error.retryAfter !== undefined) {
      const base = error.message.replace(/[.!]\s*$/, '');
      return `${base}. Try again in ${formatWait(error.retryAfter)}.`;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Field messages from a VALIDATION_ERROR (first message per field path), e.g.
 * { username: 'Username must be at least 3 characters' }. Empty for any other error.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || !Array.isArray(error.details)) return {};
  const result: Record<string, string> = {};
  for (const issue of error.details as Partial<ValidationIssue>[]) {
    if (typeof issue?.path !== 'string' || typeof issue.message !== 'string') continue;
    if (!(issue.path in result)) result[issue.path] = issue.message;
  }
  return result;
}
