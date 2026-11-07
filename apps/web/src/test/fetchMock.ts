import { vi } from 'vitest';

export interface MockRequest {
  method: string;
  /** Pathname, e.g. '/api/problems'. */
  path: string;
  query: URLSearchParams;
  /** Parsed JSON body (undefined when there is none). */
  body: unknown;
  headers: Headers;
}

export type MockHandler = (request: MockRequest) => Response | Promise<Response>;

/** A JSON Response: jsonResponse(200, page), jsonResponse(429, err, { 'Retry-After': '30' }). */
export function jsonResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The API error body: apiError(409, 'CONFLICT', 'Username already taken'). */
export function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse(status, { error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/**
 * Stubs global fetch with route handlers keyed "METHOD /api/path" (no query string). Unmatched
 * requests fail the test with a 501 so a missing handler is obvious. Returns the vi.fn, whose
 * calls can be asserted; requests are also recorded in `requests`.
 *
 *   const api = mockFetch({
 *     'GET /api/problems': ({ query }) => jsonResponse(200, page(query.get('page'))),
 *     'POST /api/auth/register': () => apiError(409, 'CONFLICT', 'Username already taken'),
 *   });
 *   expect(api.requests.at(-1)?.query.get('difficulty')).toBe('EASY');
 */
export function mockFetch(routes: Record<string, MockHandler>) {
  const requests: MockRequest[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const request: MockRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body,
      headers: new Headers(init?.headers),
    };
    requests.push(request);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      return apiError(501, 'NOT_IMPLEMENTED', `No mock for ${method} ${url.pathname}`);
    }
    return handler(request);
  });
  vi.stubGlobal('fetch', fn);
  return Object.assign(fn, { requests });
}
