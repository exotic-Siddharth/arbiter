import { defineConfig } from 'vitest/config';

/**
 * Unit + integration tests (`npm test -w @arbiter/api`). They need the compose services:
 * Postgres database arbiter_test (schema from TEST_SCHEMA, default "test") and Redis.
 * Sandbox and processor tests run separately: vitest.sandbox.config.ts (`npm run test:sandbox`).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'test/sandbox/**', '**/processor.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Test files share one database schema: run them one at a time (R13).
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 120_000,
    teardownTimeout: 20_000,
  },
});
