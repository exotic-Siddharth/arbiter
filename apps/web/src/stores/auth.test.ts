import { describe, expect, it, vi } from 'vitest';
import { useAuth } from './auth';

const me = {
  id: 'u_1',
  username: 'demo',
  email: 'demo@example.com',
  role: 'USER',
  rating: 1200,
  bio: null,
  createdAt: '2026-11-07T10:00:00.000Z',
} as const;

const authResponse = (token: string) =>
  new Response(JSON.stringify({ user: me, accessToken: token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('auth store', () => {
  it('boots as a guest without any request when no session exists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useAuth.getState().bootstrap();
    expect(useAuth.getState().status).toBe('guest');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one refresh between boot, StrictMode double calls and 401 retries', async () => {
    window.localStorage.setItem('arbiter:session', '1');
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return authResponse('fresh');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { bootstrap, refresh } = useAuth.getState();
    await Promise.all([bootstrap(), bootstrap(), refresh(), refresh()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', accessToken: 'fresh' });
  });

  it('serialises refreshes across tabs with navigator.locks', async () => {
    window.localStorage.setItem('arbiter:session', '1');
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => authResponse('locked')),
    );

    await useAuth.getState().refresh();

    expect(request).toHaveBeenCalledWith('arb-refresh', expect.any(Function));
    expect(useAuth.getState().accessToken).toBe('locked');
  });

  it('keeps the session when the refresh fails because the server is unreachable', async () => {
    useAuth.setState({ status: 'authenticated', user: me, accessToken: 'stale' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(useAuth.getState().refresh()).resolves.toBe(false);
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', accessToken: 'stale' });
  });

  it('ignores a refresh that finishes after logout', async () => {
    useAuth.setState({ status: 'authenticated', user: me, accessToken: 'old' });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/auth/refresh') {
          await gate;
          return authResponse('too-late');
        }
        return new Response(null, { status: 204 });
      }),
    );

    const pending = useAuth.getState().refresh();
    await useAuth.getState().logout();
    release();
    await pending;

    expect(useAuth.getState()).toMatchObject({ status: 'guest', user: null, accessToken: null });
    expect(window.localStorage.getItem('arbiter:session')).toBeNull();
  });

  it('login stores the session and sets the session hint', async () => {
    const fetchMock = vi.fn(async () => authResponse('login-token'));
    vi.stubGlobal('fetch', fetchMock);
    await useAuth.getState().login('demo', 'demo12345');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse(String(init.body))).toEqual({ identifier: 'demo', password: 'demo12345' });
    expect(useAuth.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'login-token',
    });
    expect(window.localStorage.getItem('arbiter:session')).toBe('1');
  });
});
