import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (spec 15, R13). Boots its own stack, never the dev one:
 *   API    http://localhost:4001  (database arbiter_e2e, Redis DB 9, own queue/socket prefixes)
 *   worker /metrics on 9465       (same env as the API)
 *   web    http://localhost:5183  (Vite, strictPort, proxying /api and /socket.io to 4001)
 * Nothing is reused (reuseExistingServer: false). The API command first migrates and seeds the
 * e2e database (e2e/support/prepare-db.ts). Judging needs Docker and arbiter-sandbox:latest
 * (`npm run sandbox:build`). Specs: e2e/*.spec.ts.
 */
export const E2E_API_PORT = 4001;
export const E2E_WEB_PORT = 5183;
export const E2E_WORKER_METRICS_PORT = 9465;
export const E2E_BASE_URL = `http://localhost:${E2E_WEB_PORT}`;

const WEB_DIR = fileURLToPath(new URL('.', import.meta.url));
const API_DIR = fileURLToPath(new URL('../api/', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const VITE = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
const PREPARE_DB = fileURLToPath(new URL('./e2e/support/prepare-db.ts', import.meta.url));

// One id per run, inherited by Playwright's worker processes: fresh BullMQ/Socket.IO/rate-limit
// namespaces so leftovers from earlier runs in Redis DB 9 never interfere.
process.env.E2E_RUN_ID ??= String(Date.now());
const runId = process.env.E2E_RUN_ID;

const serverEnv: Record<string, string> = {
  NODE_ENV: 'test',
  API_PORT: String(E2E_API_PORT),
  WEB_ORIGIN: E2E_BASE_URL,
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    'postgresql://arbiter:arbiter@localhost:55432/arbiter_e2e?schema=public',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:56379/9',
  QUEUE_PREFIX: `arbiter-e2e-${runId}`,
  SOCKET_IO_KEY: `arbiter-e2e-${runId}-sio`,
  RATE_LIMIT_PREFIX: `arb-e2e-${runId}:rl`,
  RATE_LIMITS_ENABLED: 'false',
  DEMO_LOGIN_ENABLED: 'true',
  WORKER_METRICS_PORT: String(E2E_WORKER_METRICS_PORT),
  LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
};

const node = (script: string, ...args: string[]) =>
  ['node', `"${script}"`, ...args].join(' ');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  // One shared database: run specs one at a time, and never retry (spec 15 requires three
  // consecutive green runs, so flakiness must surface).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: `${node(TSX, `"${PREPARE_DB}"`)} && ${node(TSX, 'src/index.ts')}`,
      cwd: API_DIR,
      env: serverEnv,
      url: `http://localhost:${E2E_API_PORT}/readyz`,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'worker',
      command: node(TSX, 'src/worker.ts'),
      cwd: API_DIR,
      env: serverEnv,
      url: `http://localhost:${E2E_WORKER_METRICS_PORT}/metrics`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: node(VITE, '--port', String(E2E_WEB_PORT), '--strictPort'),
      cwd: WEB_DIR,
      env: {
        API_PROXY_TARGET: `http://localhost:${E2E_API_PORT}`,
        WEB_PORT: String(E2E_WEB_PORT),
        VITE_DEMO_LOGIN: 'true',
      },
      url: E2E_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
