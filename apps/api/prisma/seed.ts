/**
 * `npm run db:seed` (prisma db seed -> tsx prisma/seed.ts). Spec section 14: wipes the application
 * tables and recreates the demo data. The work lives in src/seed/run.ts.
 *
 * Stops with a clear message, before the database is touched, when the hidden tests are missing:
 * run `npm run problems:gen` first (they are not committed).
 */
import { env } from '../src/config/env';
import { closeAll } from '../src/lib/lifecycle';
import { SeedDataError } from '../src/seed/problems';
import { SEED_ADMIN, SEED_DEMO, runSeed } from '../src/seed/run';

async function main(): Promise<void> {
  const started = Date.now();
  const summary = await runSeed();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `Seeded in ${seconds}s: ${summary.problems} problems (${summary.testCases} tests), ` +
      `${summary.users} users, ${summary.contests} contests, ${summary.submissions} submissions, ` +
      `${summary.ratingChanges} rating changes, ${summary.plagiarismPairs} plagiarism pairs.`,
  );
  console.log('');
  console.log('Demo credentials (local development values):');
  console.log(
    `  demo   username: ${SEED_DEMO.username}   password: ${env.SEED_DEMO_PASSWORD}   (also the "Try the demo" button)`,
  );
  console.log(`  admin  username: ${SEED_ADMIN.username}  password: ${env.SEED_ADMIN_PASSWORD}`);
  console.log('  every synthetic user (for example byte_baker) uses the demo password');
}

try {
  await main();
} catch (error) {
  if (error instanceof SeedDataError) {
    console.error(`\nSeed stopped: ${error.message}\n`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await closeAll();
}
