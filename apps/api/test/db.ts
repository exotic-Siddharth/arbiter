import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as appPrisma } from '../src/db/prisma';
import { onShutdown } from '../src/lib/lifecycle';
import { currentTestSchema, testDatabaseUrl } from './env';
import { migrationNames, runMigrateDeploy } from './migrate';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

async function isMigrated(client: PrismaClient): Promise<boolean> {
  try {
    const rows = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const applied = new Set(rows.map((row) => row.migration_name));
    return migrationNames().every((name) => applied.has(name));
  } catch {
    // _prisma_migrations does not exist yet.
    return false;
  }
}

/**
 * A Prisma client for database arbiter_test, schema `schema` (default TEST_SCHEMA), migrated with
 * `prisma migrate deploy` when needed. For the current TEST_SCHEMA it returns the app's own
 * client from src/db/prisma.ts, so tests and the code under test share one connection pool.
 */
export async function setupTestDatabase(
  schema: string = currentTestSchema(),
): Promise<PrismaClient> {
  const url = testDatabaseUrl(schema);
  let client: PrismaClient;
  if (schema === currentTestSchema()) {
    client = appPrisma;
  } else {
    client = new PrismaClient({ datasourceUrl: url });
    onShutdown(`test-prisma-${schema}`, () => client.$disconnect());
  }
  if (!(await isMigrated(client))) runMigrateDeploy(url);
  return client;
}

/**
 * TRUNCATE ... RESTART IDENTITY CASCADE on every app table of the client's schema
 * (_prisma_migrations is kept). Refuses to run against the dev database "arbiter".
 */
export async function resetTables(prisma: PrismaClient): Promise<void> {
  const [where] = await prisma.$queryRaw<{ db: string; schema: string }[]>`
    SELECT current_database() AS db, current_schema() AS schema`;
  if (!where || where.db === 'arbiter') {
    throw new Error('resetTables refuses to truncate the dev database "arbiter"');
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = [where.schema, ...tables.map((t) => t.tablename)];
  if (!names.every((name) => IDENTIFIER.test(name))) {
    throw new Error(`resetTables: unexpected identifier in ${names.join(', ')}`);
  }
  const list = tables.map((t) => `"${where.schema}"."${t.tablename}"`).join(', ');
  await prisma.$executeRaw`TRUNCATE TABLE ${Prisma.raw(list)} RESTART IDENTITY CASCADE`;
}
