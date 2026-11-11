import { MeSchema, StatsSchema, type Me } from '@arbiter/shared';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/stores/auth';
import { api, ApiError, fieldErrors, getErrorMessage } from './api';

const me: Me = MeSchema.parse({
  id: 'u_1',
  username: 'demo',
  email: 'demo@example.com',
  role: 'USER',
  rating: 1200,
  bio: null,
  createdAt: '2026-11-07T10:00:00.000Z',
});

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const unauthorized = () =>
  json(401, { error: { code: 'UNAUTHORIZED', message: 'Access token expired' } });

function signIn(token = 'old-token') {
  useAuth.setState({ status: 'authenticated', user: me, accessToken: token });
}

function authHeader(init?: RequestInit): string | null {
  return new Headers(init?.headers).get('Authorization');
}

describe('api client', () => {
  it('concurrent 401s trigger exactly one refresh', async () => {
    signIn();
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json(200, { user: me, accessToken: 'new-token' });
      }
      if (authHeader(init) === 'Bearer new-token') return json(200, { url });
      return unauthorized();
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      api.get('/problems'),
      api.get('/contests'),
      api.post('/runs', { language: 'CPP' }),
      api.get('/stats'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toEqual([
      { url: '/api/problems' },
      { url: '/api/contests' },
      { url: '/api/runs' },
      { url: '/api/stats' },
    ]);
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', accessToken: 'new-token' });
  });

  it('retries a late 401 with the already refreshed token instead of refreshing again', async () => {
    signIn();
    let refreshCalls = 0;
    let slowRelease: () => void = () => {};
    const slowGate = new Promise<void>((resolve) => {
      slowRelease = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/auth/refresh') {
          refreshCalls += 1;
          return json(200, { user: me, accessToken: 'new-token' });
        }
        if (authHeader(init) === 'Bearer new-token') return json(200, { url });
        // The slow request was sent with the old token and only fails after the refresh is done.
        if (url === '/api/slow') await slowGate;
        return unauthorized();
      }),
    );

    const slow = api.get('/slow');
    await api.get('/fast');
    slowRelease();

    await expect(slow).resolves.toEqual({ url: '/api/slow' });
    expect(refreshCalls).toBe(1);
  });

  it('failed refresh logs out', async () => {
    signIn();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === '/api/auth/refresh') {
          return json(401, { error: { code: 'UNAUTHORIZED', message: 'Refresh token reused' } });
        }
        return unauthorized();
      }),
    );

    const failure = await api.get('/auth/me').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(calls.filter((url) => url === '/api/auth/refresh')).toHaveLength(1);
    expect(useAuth.getState()).toMatchObject({ status: 'guest', user: null, accessToken: null });
  });

  it('attaches the bearer token and validates the response with the schema', async () => {
    signIn('abc');
    const fetchMock = vi.fn(async () =>
      json(200, { problems: 15, users: 32, submissions: 900, judgedToday: 12, runningContests: 1 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const stats = await api.get('/stats', { schema: StatsSchema });

    expect(stats.problems).toBe(15);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(authHeader(init)).toBe('Bearer abc');
  });

  it('rejects responses that do not match the schema', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { problems: 'many' })),
    );
    await expect(api.get('/stats', { schema: StatsSchema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it('serialises query params and skips empty values', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json(200, { items: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/problems', {
      query: {
        search: 'graph',
        difficulty: undefined,
        tag: '',
        page: 2,
        mine: true,
        ids: ['a', 'b'],
      },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/problems?search=graph&page=2&mine=true&ids=a&ids=b',
    );
  });

  it('throws ApiError with retryAfter for 429 responses', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          429,
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many submissions',
              details: { retryAfterSec: 37 },
            },
          },
          { 'Retry-After': '37' },
        ),
      ),
    );

    const error = await api.post('/submissions', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 37 });
    expect(getErrorMessage(error)).toBe('Too many submissions. Try again in 37 s.');
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(api.get('/stats')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('maps validation details to field errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid data',
            details: [
              { location: 'body', path: 'username', message: 'Too short', code: 'too_small' },
              { location: 'body', path: 'username', message: 'Second issue', code: 'custom' },
              {
                location: 'body',
                path: 'email',
                message: 'Enter a valid email',
                code: 'invalid_string',
              },
            ],
          },
        }),
      ),
    );
    const error = await api.post('/auth/register', {}).catch((e: unknown) => e);
    expect(fieldErrors(error)).toEqual({ username: 'Too short', email: 'Enter a valid email' });
  });

  it('returns undefined for 204 responses', async () => {
    signIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(api.post('/contests/weekly/register')).resolves.toBeUndefined();
  });
});
