import type { PrismaClient } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '../../test/db';
import { createProblem, createUser } from '../../test/factories';

let prisma: PrismaClient;
beforeAll(async () => {
  prisma = await setupTestDatabase();
});

/** [table, columns in order]: A-26 (aggregate reads) and A-51 (foreign keys scanned on cascades). */
const REQUIRED: [string, string[]][] = [
  ['User', ['rating']],
  ['Submission', ['verdict', 'userId', 'problemId']],
  ['Problem', ['authorId']],
  ['ProblemTag', ['tagId']],
  ['ContestProblem', ['problemId']],
  ['ContestRegistration', ['userId']],
  ['RatingChange', ['contestId']],
  ['PlagiarismReport', ['contestId']],
];

describe('indexes added by the review (A-26, A-51)', () => {
  it('has an index led by the expected columns on every listed table', async () => {
    const rows = await prisma.$queryRaw<{ table: string; columns: string[] }[]>`
      SELECT t.relname AS "table",
             ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                   ORDER BY k.ord) AS columns
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema()`;
    for (const [table, columns] of REQUIRED) {
      const found = rows.some(
        (row) =>
          row.table === table && columns.every((column, index) => row.columns[index] === column),
      );
      expect(found, `${table}(${columns.join(', ')})`).toBe(true);
    }
  });

  it('the stuck-row reconciler range-scans Submission(status, createdAt), not the whole table', async () => {
    // Steady state: a long history of DONE rows and nothing stuck. The rows and the statistics of
    // ANALYZE live only inside this transaction, which is rolled back.
    const user = await createUser(prisma);
    const problem = await createProblem(prisma);
    let plan = '';
    const rollback = new Error('rollback');
    await prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`
            INSERT INTO "Submission" (id, "userId", "problemId", language, "sourceCode", status, "createdAt")
            SELECT 'idx-' || g, ${user.id}, ${problem.id}, 'PYTHON', 'print(1)', 'DONE',
                   now() - g * interval '1 second'
            FROM generate_series(1, 20000) AS g`;
          await tx.$executeRawUnsafe('ANALYZE "Submission"');
          const rows = await tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
            `EXPLAIN SELECT id FROM "Submission"
             WHERE status IN ('QUEUED', 'COMPILING', 'RUNNING')
               AND "createdAt" < now() - interval '5 minutes'
             ORDER BY "createdAt" LIMIT 200`,
          );
          plan = rows.map((row) => row['QUERY PLAN']).join(' ');
          throw rollback;
        },
        { timeout: 60_000 },
      )
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    expect(plan).toContain('Submission_status_createdAt_idx');
    expect(plan).toMatch(/Index Cond: \(\(?status = ANY/);
    expect(plan).not.toContain('Seq Scan');
  });
});
