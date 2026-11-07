import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactUrl } from './env';

const require = createRequire(import.meta.url);

export const API_DIR = fileURLToPath(new URL('..', import.meta.url));
export const SCHEMA_PATH = join(API_DIR, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = join(API_DIR, 'prisma', 'migrations');

/**
 * `prisma migrate deploy` against `databaseUrl` (creates the database and schema if missing).
 * Spawns the Prisma CLI with the current Node binary (R13: never spawn("npx") on Windows).
 */
export function runMigrateDeploy(databaseUrl: string): void {
  try {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', SCHEMA_PATH],
      {
        cwd: API_DIR,
        env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
        stdio: 'pipe',
        encoding: 'utf8',
      },
    );
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `prisma migrate deploy failed for ${redactUrl(databaseUrl)}:\n` +
        `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`,
    );
  }
}

/** Names of the migration folders in prisma/migrations, sorted. */
export function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort();
}
