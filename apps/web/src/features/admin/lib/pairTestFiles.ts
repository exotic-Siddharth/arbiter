/**
 * Pairs bulk-uploaded test files by basename: "01.in" + "01.out" is one test. Inputs without
 * an output (and the reverse) and repeated names are reported as orphans; files that are
 * neither .in nor .out are ignored. Pairs come back in natural order (9 before 10), which is
 * the ordinal order of the upload.
 */

export interface NamedFile {
  name: string;
}

export interface TestFilePair<F extends NamedFile = File> {
  /** Shared basename, e.g. "01". */
  name: string;
  input: F;
  output: F;
}

export type OrphanReason = 'missing-output' | 'missing-input' | 'duplicate';

export interface TestFileOrphan<F extends NamedFile = File> {
  file: F;
  reason: OrphanReason;
}

export interface PairedTestFiles<F extends NamedFile = File> {
  pairs: TestFilePair<F>[];
  orphans: TestFileOrphan<F>[];
  ignored: F[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** "01.in" -> { base: "01", kind: "in" }; null for any other extension. */
export function splitTestFileName(name: string): { base: string; kind: 'in' | 'out' } | null {
  const match = /^(.+)\.(in|out)$/i.exec(name);
  if (!match) return null;
  return { base: match[1] as string, kind: (match[2] as string).toLowerCase() as 'in' | 'out' };
}

export function pairTestFiles<F extends NamedFile>(files: readonly F[]): PairedTestFiles<F> {
  // Basenames match case-insensitively (Windows file names do).
  const groups = new Map<string, { base: string; input?: F; output?: F }>();
  const orphans: TestFileOrphan<F>[] = [];
  const ignored: F[] = [];

  for (const file of files) {
    const parsed = splitTestFileName(file.name);
    if (!parsed) {
      ignored.push(file);
      continue;
    }
    const key = parsed.base.toLowerCase();
    const group = groups.get(key) ?? { base: parsed.base };
    const slot = parsed.kind === 'in' ? 'input' : 'output';
    if (group[slot]) {
      orphans.push({ file, reason: 'duplicate' });
      continue;
    }
    group[slot] = file;
    groups.set(key, group);
  }

  const pairs: TestFilePair<F>[] = [];
  for (const group of groups.values()) {
    if (group.input && group.output) {
      pairs.push({ name: group.base, input: group.input, output: group.output });
    } else if (group.input) {
      orphans.push({ file: group.input, reason: 'missing-output' });
    } else if (group.output) {
      orphans.push({ file: group.output, reason: 'missing-input' });
    }
  }

  pairs.sort((a, b) => collator.compare(a.name, b.name));
  orphans.sort((a, b) => collator.compare(a.file.name, b.file.name));
  ignored.sort((a, b) => collator.compare(a.name, b.name));
  return { pairs, orphans, ignored };
}
