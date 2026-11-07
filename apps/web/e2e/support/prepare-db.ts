/**
 * E2E database preparation (R13). playwright.config.ts runs this right before it starts the API:
 * Playwright launches webServers BEFORE globalSetup, so it cannot be a globalSetup.
 *
 * 1. `prisma migrate deploy` against DATABASE_URL (creates arbiter_e2e when missing);
 * 2. the seed (spec 14; it wipes and recreates, so reruns are idempotent).
 *
 * Refuses any database whose name does not end in "_e2e", so it can never wipe dev data.
 * CLIs are spawned with the current Node binary (R14: never spawn("npx")).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const API_DIR = fileURLToPath(new URL('../../../api/', import.meta.url));
const requireFromApi = createRequire(new URL('../../../api/package.json', import.meta.url));

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl ? new URL(databaseUrl).pathname.replace(/^\//, '') : '';
if (!databaseName.endsWith('_e2e')) {
  console.error(`[e2e] refusing to prepare database "${databaseName || '(unset)'}": expected *_e2e`);
  process.exit(1);
}

const env = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' };
const run = (label: string, args: string[]) => {
  console.log(`[e2e] ${label}`);
  execFileSync(process.execPath, args, { cwd: API_DIR, env, stdio: 'inherit' });
};

run(`migrate ${databaseName}`, [requireFromApi.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
run(`seed ${databaseName}`, [requireFromApi.resolve('tsx/cli'), 'prisma/seed.ts']);
console.log('[e2e] database ready');
