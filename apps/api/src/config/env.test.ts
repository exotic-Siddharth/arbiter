import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const secret = { JWT_ACCESS_SECRET: 's'.repeat(32) };

describe('parseEnv', () => {
  it('applies the spec defaults', () => {
    const env = parseEnv({ ...secret });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:5173',
      REDIS_URL: 'redis://localhost:56379/0',
      QUEUE_PREFIX: 'arbiter',
      SOCKET_IO_KEY: 'arbiter-sio',
      RATE_LIMITS_ENABLED: true,
      RATE_LIMIT_PREFIX: 'arb:rl',
      TRUST_PROXY: 0,
      ACCESS_TOKEN_TTL_SEC: 900,
      REFRESH_TOKEN_TTL_DAYS: 14,
      COOKIE_SECURE: false,
      DEMO_LOGIN_ENABLED: true,
      SANDBOX_IMAGE: 'arbiter-sandbox:latest',
      DOCKER_BIN: 'docker',
      JUDGE_CONCURRENCY: 2,
      RUN_CONCURRENCY: 1,
      WORKER_METRICS_PORT: 9464,
      SEED_ADMIN_PASSWORD: 'admin12345',
      SEED_DEMO_PASSWORD: 'demo12345',
    });
    expect(env.SANDBOX_RUNTIME).toBeUndefined();
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv({ ...secret, SANDBOX_RUNTIME: '', API_PORT: '', RATE_LIMITS_ENABLED: '' });
    expect(env.SANDBOX_RUNTIME).toBeUndefined();
    expect(env.API_PORT).toBe(4000);
    expect(env.RATE_LIMITS_ENABLED).toBe(true);
  });

  it('derives SOCKET_IO_KEY from QUEUE_PREFIX unless set', () => {
    expect(parseEnv({ ...secret, QUEUE_PREFIX: 'e2e' }).SOCKET_IO_KEY).toBe('e2e-sio');
    expect(parseEnv({ ...secret, SOCKET_IO_KEY: 'custom' }).SOCKET_IO_KEY).toBe('custom');
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => parseEnv({})).toThrow(/JWT_ACCESS_SECRET is required/);
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });

  it('refuses RATE_LIMITS_ENABLED=false in production (R2)', () => {
    expect(() =>
      parseEnv({ ...secret, NODE_ENV: 'production', RATE_LIMITS_ENABLED: 'false' }),
    ).toThrow(/RATE_LIMITS_ENABLED=false is not allowed/);
    expect(
      parseEnv({ ...secret, NODE_ENV: 'test', RATE_LIMITS_ENABLED: 'false' }).RATE_LIMITS_ENABLED,
    ).toBe(false);
  });

  it('turns demo login and the admin seed default off outside development', () => {
    const prod = parseEnv({ ...secret, NODE_ENV: 'production' });
    expect(prod.DEMO_LOGIN_ENABLED).toBe(false);
    expect(prod.SEED_ADMIN_PASSWORD).toBeUndefined();
    expect(parseEnv({ ...secret, NODE_ENV: 'test' }).DEMO_LOGIN_ENABLED).toBe(false);
  });

  it('lists every invalid variable', () => {
    expect(() => parseEnv({ ...secret, API_PORT: 'abc', COOKIE_SECURE: 'maybe' })).toThrow(
      /API_PORT[\s\S]*COOKIE_SECURE|COOKIE_SECURE[\s\S]*API_PORT/,
    );
  });
});
