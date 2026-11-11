import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { API_ROOT } from '../config/env';

/**
 * Loads the problem folders under seed/problems (protocol: seed/problems/README.md) for the seed.
 * Hidden tests are not committed (they are about 90 MB); `npm run problems:gen` regenerates them
 * byte for byte, and assertHiddenTests() makes the seed stop before it touches the database when
 * any is missing.
 */

export const GEN_COMMAND = 'npm run problems:gen';

/** A problem the seed cannot load; the message tells the user what to run. */
export class SeedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedDataError';
  }
}

export interface SeedTest {
  ordinal: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  explanation: string | null;
}

export interface SeedProblem {
  slug: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  checker: 'TOKENS' | 'EXACT' | 'FLOAT';
  floatTolerance: number | null;
  statementMd: string;
  tests: SeedTest[];
  refCpp: string;
  refPy: string;
  slowPy: string | null;
  wrongPy: string | null;
}

interface Meta {
  slug: string;
  title: string;
  difficulty: SeedProblem['difficulty'];
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  checker: SeedProblem['checker'];
  floatTolerance?: number;
  samples: number[];
}

/** Minimum tests per problem (seed/problems/README.md: 10 to 14, samples included). */
const MIN_TESTS = 10;

export function problemsRoot(): string {
  return process.env.SEED_PROBLEMS_DIR ?? join(API_ROOT, '..', '..', 'seed', 'problems');
}

/** CRLF (and lone CR) to LF (R9): files may be checked out with Windows line endings. */
export const lf = (text: string): string => text.replace(/\r\n?/g, '\n');

export function problemSlugs(root: string = problemsRoot()): string[] {
  if (!existsSync(root)) throw new SeedDataError(`The problems folder does not exist: ${root}`);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'meta.json')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Fails fast, before anything is written, when a hidden test is missing: every file pinned in
 * CHECKSUMS.sha256 must exist, every NN.in needs its NN.out, and each problem needs at least 10 tests.
 */
export function assertHiddenTests(root: string = problemsRoot()): string[] {
  const slugs = problemSlugs(root);
  if (slugs.length === 0) throw new SeedDataError(`No problem folders found under ${root}`);
  const missing: string[] = [];
  const checksums = join(root, 'CHECKSUMS.sha256');
  if (existsSync(checksums)) {
    for (const line of lf(readFileSync(checksums, 'utf8')).split('\n')) {
      const match = /^[0-9a-f]{64} [ *](.+)$/.exec(line.trim());
      if (match && !existsSync(join(root, match[1]))) missing.push(match[1]);
    }
  }
  for (const slug of slugs) {
    const dir = join(root, slug, 'tests');
    const names = existsSync(dir) ? readdirSync(dir) : [];
    const inputs = names.filter((name) => /^\d+\.in$/.test(name));
    for (const input of inputs) {
      const output = input.replace(/\.in$/, '.out');
      if (!names.includes(output)) missing.push(`${slug}/tests/${output}`);
    }
    if (inputs.length < MIN_TESTS)
      missing.push(`${slug}/tests/ (${inputs.length} of at least ${MIN_TESTS} tests)`);
  }
  if (missing.length > 0) {
    const shown = [...new Set(missing)].slice(0, 8).join(', ');
    const more = new Set(missing).size > 8 ? `, and ${new Set(missing).size - 8} more` : '';
    throw new SeedDataError(
      `The hidden tests are missing (${new Set(missing).size} files; e.g. ${shown}${more}).\n` +
        `They are not committed (about 90 MB). Run \`${GEN_COMMAND}\` to regenerate them, then seed again.`,
    );
  }
  return slugs;
}

const read = (path: string): string => lf(readFileSync(path, 'utf8'));
const readOptional = (path: string): string | null => (existsSync(path) ? read(path) : null);

export function loadSeedProblem(root: string, slug: string): SeedProblem {
  const dir = join(root, slug);
  const meta = JSON.parse(read(join(dir, 'meta.json'))) as Meta;
  if (meta.slug !== slug) throw new SeedDataError(`${slug}/meta.json has slug "${meta.slug}"`);
  const testsDir = join(dir, 'tests');
  const ordinals = readdirSync(testsDir)
    .map((name) => /^(\d+)\.in$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const samples = new Set(meta.samples);
  const tests: SeedTest[] = ordinals.map((ordinal) => {
    const name = String(ordinal).padStart(2, '0');
    const isSample = samples.has(ordinal);
    return {
      ordinal,
      input: read(join(testsDir, `${name}.in`)),
      expectedOutput: read(join(testsDir, `${name}.out`)),
      isSample,
      explanation: isSample ? (readOptional(join(testsDir, `${name}.md`))?.trim() ?? null) : null,
    };
  });
  return {
    slug,
    title: meta.title,
    difficulty: meta.difficulty,
    tags: meta.tags,
    timeLimitMs: meta.timeLimitMs,
    memoryLimitMb: meta.memoryLimitMb,
    checker: meta.checker,
    floatTolerance: meta.checker === 'FLOAT' ? (meta.floatTolerance ?? null) : null,
    statementMd: read(join(dir, 'problem.md')),
    tests,
    refCpp: read(join(dir, 'ref.cpp')),
    refPy: read(join(dir, 'ref.py')),
    slowPy: readOptional(join(dir, 'slow.py')),
    wrongPy: readOptional(join(dir, 'wrong.py')),
  };
}

/** Load every problem folder (call assertHiddenTests first). */
export function loadSeedProblems(root: string = problemsRoot()): SeedProblem[] {
  return problemSlugs(root).map((slug) => loadSeedProblem(root, slug));
}
