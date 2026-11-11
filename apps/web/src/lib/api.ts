import { useAuth } from '@/stores/auth';
import {
  parseResponse,
  send,
  type HttpMethod,
  type QueryParams,
  type ResponseSchema,
} from './http';

export {
  ApiError,
  fieldErrors,
  formatWait,
  getErrorMessage,
  isAbortError,
  isApiError,
  type ApiErrorCode,
  type QueryParams,
} from './http';

export interface RequestOptions<T> {
  /** zod schema from @arbiter/shared; the response is validated and typed with it. */
  schema?: ResponseSchema<T>;
  /** Query string; undefined, null and '' values are skipped, arrays repeat the key. */
  query?: QueryParams;
  /** Pass TanStack Query's `signal` so cancelled queries abort their fetch. */
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** false = send no access token and never refresh (default true). */
  auth?: boolean;
  /** Called with the final response (after any token retry), e.g. to read its Date header. */
  onResponse?: (response: Response) => void;
}

/**
 * The 401 path (spec 13.2): a request sent with `staleToken` was rejected. If another request
 * already refreshed in the meantime, retry with the new token; otherwise run the shared
 * single-flight refresh. Returns null when the session could not be renewed (the store has
 * logged out if the refresh token was rejected).
 */
async function renewToken(staleToken: string): Promise<string | null> {
  const current = useAuth.getState();
  if (current.accessToken && current.accessToken !== staleToken) return current.accessToken;
  if (!current.accessToken) return null;
  const renewed = await current.refresh();
  return renewed ? useAuth.getState().accessToken : null;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  options: RequestOptions<T> = {},
): Promise<T> {
  const withAuth = options.auth !== false;
  // While the boot refresh is in flight, wait for it so the first requests carry the token.
  if (withAuth) await useAuth.getState().ready();
  const token = withAuth ? useAuth.getState().accessToken : null;
  const sendOnce = (accessToken: string | null) =>
    send({
      method,
      path,
      body,
      token: accessToken,
      query: options.query,
      signal: options.signal,
      headers: options.headers,
    });

  let response = await sendOnce(token);
  if (response.status === 401 && withAuth && token) {
    const renewed = await renewToken(token);
    if (renewed) response = await sendOnce(renewed);
  }
  options.onResponse?.(response);
  return parseResponse(response, options.schema);
}

/**
 * Typed REST client for the Arbiter API. Paths are relative to /api ('/problems' ->
 * '/api/problems'). Attaches the access token, refreshes once on 401 (concurrent 401s share one
 * refresh) and retries, and rejects with ApiError {status, code, message, details, retryAfter}.
 *
 *   const page = await api.get('/problems', { query: { page: 2 }, schema: ProblemPageSchema, signal });
 *   await api.post('/submissions', body, { schema: CreateSubmissionResponseSchema });
 */
export const api = {
  get<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T> {
    return request<T>('GET', path, undefined, options);
  },
  delete<T = unknown>(path: string, options?: RequestOptions<T>): Promise<T> {
    return request<T>('DELETE', path, undefined, options);
  },
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T> {
    return request<T>('POST', path, body, options);
  },
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T> {
    return request<T>('PUT', path, body, options);
  },
  patch<T = unknown>(path: string, body?: unknown, options?: RequestOptions<T>): Promise<T> {
    return request<T>('PATCH', path, body, options);
  },
};
