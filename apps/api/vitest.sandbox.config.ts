import { defineConfig } from 'vitest/config';

/**
 * Real-Docker sandbox tests and judge processor tests (R20): `npm run test:sandbox` from the repo root
 * (builds arbiter-sandbox:latest first if it is missing). Needs Docker, the image, Postgres and Redis.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/sandbox/**/*.test.ts', 'src/**/processor.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 180_000,
    hookTimeout: 300_000,
    teardownTimeout: 30_000,
    passWithNoTests: true,
  },
});
