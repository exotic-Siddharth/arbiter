/**
 * Test database/Redis locations (R13). Imported by global-setup.ts and setup.ts, so this file
 * must not import application code (src/config/env.ts parses process.env at import time).
 *
 *   TEST_SCHEMA        schema inside arbiter_test (default "test"; lanes use lane_<id>, e.g. lane_a3)
 *   TEST_DATABASE_URL  base URL of the test database (default below)
 *   TEST_REDIS_URL     Redis URL for tests (default DB 15; isolation comes from random key prefixes)
 */

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://arbiter:arbiter@localhost:55432/arbiter_test';
export const DEFAULT_TEST_REDIS_URL = 'redis://localhost:56379/15';

const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function currentTestSchema(): string {
  const schema = process.env.TEST_SCHEMA?.trim() || 'test';
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new Error(`TEST_SCHEMA "${schema}" must match ${SCHEMA_PATTERN}`);
  }
  return schema;
}

/** Throws unless the URL points at a test database (never the dev database "arbiter"). */
export function assertTestDatabase(databaseUrl: string): void {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (name === '' || name === 'arbiter') {
    throw new Error(
      `Refusing to run tests against database "${name || '(none)'}": tests use arbiter_test (R13).`,
    );
  }
}

/** postgresql://.../arbiter_test?schema=<schema> */
export function testDatabaseUrl(schema: string = currentTestSchema()): string {
  if (!SCHEMA_PATTERN.test(schema)) throw new Error(`Invalid schema name "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL);
  url.searchParams.set('schema', schema);
  const result = url.toString();
  assertTestDatabase(result);
  return result;
}

export function testRedisUrl(): string {
  return process.env.TEST_REDIS_URL ?? DEFAULT_TEST_REDIS_URL;
}

/** Password part replaced, for error messages. */
export function redactUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (url.password) url.password = '***';
  return url.toString();
}
