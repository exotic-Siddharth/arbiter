import type { PrismaClient } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase } from '../../test/db';

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
});
