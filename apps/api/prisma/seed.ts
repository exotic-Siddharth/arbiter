/**
 * `npm run db:seed` (prisma db seed -> tsx prisma/seed.ts). Spec section 14: wipes the application
 * tables and recreates the demo data. The work lives in src/seed/run.ts.
 *
 * Stops with a clear message, before the database is touched, when the hidden tests are missing:
 * run `npm run problems:gen` first (they are not committed).
 */
import { closeAll } from '../src/lib/lifecycle';
import { SeedDataError } from '../src/seed/problems';
import { credentialLines, runSeed } from '../src/seed/run';

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
  for (const line of credentialLines()) console.log(line);
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
