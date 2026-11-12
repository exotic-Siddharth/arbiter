import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

/**
 * The production deployment files (docker-compose.prod.yml + .env.production.example) against the
 * production config guard (review A-09): the example, once its blanks are filled in, must produce an
 * environment the API accepts, and the compose file may only read variables the example documents.
 */
const repoFile = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${name}`, import.meta.url)), 'utf8');

const example = repoFile('.env.production.example');
const compose = repoFile('docker-compose.prod.yml');

function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const filled = {
  POSTGRES_PASSWORD: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718',
  JWT_ACCESS_SECRET: 'k8Qm2xVt0pLw5ZrYb7NcJh3FsDg9AeUo1XiTn4MvBqRyKzWc',
  DOCKER_GID: '999',
};

/** What docker-compose.prod.yml hands to the api and worker processes, given the example's values. */
function containerEnv(values: Record<string, string>): Record<string, string> {
  return {
    NODE_ENV: 'production',
    API_PORT: '4000',
    WEB_ORIGIN: values.PUBLIC_ORIGIN,
    DATABASE_URL: `postgresql://arbiter:${values.POSTGRES_PASSWORD}@postgres:5432/arbiter?schema=public`,
    REDIS_URL: 'redis://redis:6379/0',
    QUEUE_PREFIX: 'arbiter',
    TRUST_PROXY: '1',
    JWT_ACCESS_SECRET: values.JWT_ACCESS_SECRET,
    COOKIE_SECURE: 'true',
    DEMO_LOGIN_ENABLED: values.DEMO_LOGIN_ENABLED,
    LOG_LEVEL: values.LOG_LEVEL,
    SANDBOX_IMAGE: values.SANDBOX_IMAGE,
    SANDBOX_RUNTIME: values.SANDBOX_RUNTIME,
    DOCKER_BIN: 'docker',
    JUDGE_CONCURRENCY: values.JUDGE_CONCURRENCY,
    RUN_CONCURRENCY: values.RUN_CONCURRENCY,
    WORKER_METRICS_PORT: '9464',
  };
}

describe('.env.production.example', () => {
  const values = parseDotenv(example);

  it('ships no secrets: every required secret is blank', () => {
    expect(values.JWT_ACCESS_SECRET).toBe('');
    expect(values.POSTGRES_PASSWORD).toBe('');
    expect(values.DOCKER_GID).toBe('');
    expect(example).not.toMatch(/dev-only|change-me|admin12345|demo12345/i);
  });

  it('is accepted by the production config guard once the blanks are filled in', () => {
    const env = parseEnv(containerEnv({ ...values, ...filled }));
    expect(env.isProduction).toBe(true);
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.RATE_LIMITS_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.DEMO_LOGIN_ENABLED).toBe(false);
    expect(env.WEB_ORIGIN).toBe('https://judge.example.com');
    expect(env.SANDBOX_RUNTIME).toBeUndefined();
  });

  it('is refused while the JWT secret is still blank', () => {
    expect(() => parseEnv(containerEnv({ ...values, ...filled, JWT_ACCESS_SECRET: '' }))).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('is refused if someone pastes the published development secret', () => {
    const dev = 'dev-only-insecure-access-secret-change-me-0000';
    expect(() => parseEnv(containerEnv({ ...values, ...filled, JWT_ACCESS_SECRET: dev }))).toThrow(
      /published development value/,
    );
  });
});

describe('docker-compose.prod.yml', () => {
  it('only reads variables that .env.production.example documents (or that have a default)', () => {
    const documented = new Set(Object.keys(parseDotenv(example)));
    const used = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(:?[-?][^}]*)?\}/g)];
    expect(used.length).toBeGreaterThan(10);
    const undocumented = used
      .filter(([, name, modifier]) => !documented.has(name) && !modifier?.startsWith(':-'))
      .map(([, name]) => name);
    expect(undocumented).toEqual([]);
  });

  it('requires the secrets instead of defaulting them', () => {
    expect(compose).toMatch(/\$\{JWT_ACCESS_SECRET:\?/);
    expect(compose).toMatch(/\$\{POSTGRES_PASSWORD:\?/);
    expect(compose).not.toMatch(/\$\{(JWT_ACCESS_SECRET|POSTGRES_PASSWORD):-/);
  });

  it('keeps rate limiting and secure cookies on', () => {
    expect(compose).toMatch(/COOKIE_SECURE: 'true'/);
    expect(compose).not.toMatch(/RATE_LIMITS_ENABLED/);
  });
});
