import { BulkTestsBody, LIMITS } from '@arbiter/shared';
import { normalizeTestText, readFileText } from './files';
import type { TestFilePair } from './pairTestFiles';

export interface BulkBuildOptions {
  /** The first N pairs (in natural file order) are marked as samples. */
  sampleCount: number;
  replace: boolean;
}

export type BulkBuildResult = { ok: true; body: BulkTestsBody } | { ok: false; message: string };

/**
 * Reads the paired files and builds the POST /tests/bulk body. Array order is the ordinal
 * order, so pairs keep their natural file order (01, 02, ... 10). Text is normalised like the
 * seed does (no BOM, "\n" line endings).
 */
export async function buildBulkBody(
  pairs: readonly TestFilePair<File>[],
  { sampleCount, replace }: BulkBuildOptions,
): Promise<BulkBuildResult> {
  if (pairs.length === 0)
    return { ok: false, message: 'Select at least one matching .in and .out pair.' };
  if (pairs.length > LIMITS.bulkTestsMax) {
    return {
      ok: false,
      message: `At most ${LIMITS.bulkTestsMax} tests per upload; split the files into batches.`,
    };
  }
  const tests = await Promise.all(
    pairs.map(async (pair, index) => ({
      input: normalizeTestText(await readFileText(pair.input)),
      expectedOutput: normalizeTestText(await readFileText(pair.output)),
      isSample: index < sampleCount,
    })),
  );
  const parsed = BulkTestsBody.safeParse({ tests, replace });
  if (parsed.success) return { ok: true, body: parsed.data };
  const issue = parsed.error.issues[0];
  const index = typeof issue?.path[1] === 'number' ? issue.path[1] : null;
  const where = index === null ? '' : `${pairs[index]?.name ?? `test ${index + 1}`}: `;
  return {
    ok: false,
    message: `${where}${issue?.message ?? 'The files are not valid test data.'}`,
  };
}
