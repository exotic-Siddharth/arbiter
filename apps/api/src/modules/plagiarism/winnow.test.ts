import { describe, expect, it } from 'vitest';
import {
  CPP_ORIGINAL,
  CPP_RENAMED_REFORMATTED,
  CPP_COMMENTED,
  CPP_UNRELATED,
  PY_ORIGINAL,
  PY_RENAMED,
  PY_UNRELATED,
} from './samples.fixture';
import { fingerprints, fnv1a64, matchedLines, similarity, tokenize, winnow } from './winnow';

const kinds = (lang: Parameters<typeof tokenize>[0], code: string) =>
  tokenize(lang, code).map((t) => t.kind);

describe('tokenize', () => {
  it('normalises identifiers, numbers and strings and keeps keywords and operators', () => {
    expect(kinds('CPP', 'int total = count + 42; // sum\nreturn "x";')).toEqual([
      'int',
      'I',
      '=',
      'I',
      '+',
      'N',
      ';',
      'return',
      'S',
      ';',
    ]);
  });

  it('records the 1-based line of every token and skips block comments', () => {
    const tokens = tokenize('JAVA', 'class A {\n  /* a\n  b */ int x = 1;\n}\n');
    expect(tokens.map((t) => [t.kind, t.line])).toEqual([
      ['class', 1],
      ['I', 1],
      ['{', 1],
      ['int', 3],
      ['I', 3],
      ['=', 3],
      ['N', 3],
      [';', 3],
      ['}', 4],
    ]);
  });

  it('uses longest-match operators and reads numeric forms as N', () => {
    expect(kinds('JAVASCRIPT', 'a >>>= 0x1F; b === 1e-6 ?? c?.d => .5;')).toEqual([
      'I',
      '>>>=',
      'N',
      ';',
      'I',
      '===',
      'N',
      '??',
      'I',
      '?.',
      'I',
      '=>',
      'N',
      ';',
    ]);
  });

  it('handles Python comments, prefixed strings and triple-quoted strings', () => {
    const code = 'x = f"hi {y}"  # note\ns = """a\nb"""\nif x: pass\n';
    expect(tokenize('PYTHON', code).map((t) => [t.kind, t.line])).toEqual([
      ['I', 1],
      ['=', 1],
      ['S', 1],
      ['I', 2],
      ['=', 2],
      ['S', 2],
      ['if', 4],
      ['I', 4],
      [':', 4],
      ['pass', 4],
    ]);
  });

  it('handles JS template literals, char literals and escaped quotes', () => {
    expect(kinds('JAVASCRIPT', 'const s = `a ${b} c`; let t = "q\\"q";')).toEqual([
      'const',
      'I',
      '=',
      'S',
      ';',
      'let',
      'I',
      '=',
      'S',
      ';',
    ]);
    expect(kinds('CPP', "char c = '\\n';")).toEqual(['char', 'I', '=', 'S', ';']);
  });

  it('does not crash on unterminated strings or comments, CRLF or empty input', () => {
    expect(tokenize('CPP', '')).toEqual([]);
    expect(kinds('CPP', 'a = "open')).toEqual(['I', '=', 'S']);
    expect(kinds('JAVA', 'a /* never closed')).toEqual(['I']);
    expect(tokenize('PYTHON', 'a = 1\r\nb = 2\r\n').map((t) => t.line)).toEqual([1, 1, 1, 2, 2, 2]);
  });
});

describe('fingerprints', () => {
  it('fnv1a64 matches the reference FNV-1a 64-bit vectors', () => {
    expect(fnv1a64('')).toBe(0xcbf29ce484222325n);
    expect(fnv1a64('a')).toBe(0xaf63dc4c8601ec8cn);
    expect(fnv1a64('foobar')).toBe(0x85944171f73967e8n);
  });

  it('winnow keeps the minimum of each window, rightmost on ties, once per position', () => {
    // windows (w=4): [5,3,8,3] -> 3@3, [3,8,3,9] -> 3@3, [8,3,9,1] -> 1@5, [3,9,1,1] -> 1@6
    expect(winnow([5n, 3n, 8n, 3n, 9n, 1n, 1n], 4)).toEqual([3, 5, 6]);
    expect(winnow([4n, 2n], 4)).toEqual([1]);
    expect(winnow([], 4)).toEqual([]);
  });

  it('hashes k-grams with the lines they cover', () => {
    const tokens = tokenize('PYTHON', 'a = 1\nb = 2\nc = a + b\nprint(c)\n');
    const prints = fingerprints(tokens, 8, 4);
    expect(prints.length).toBeGreaterThan(0);
    for (const p of prints) {
      expect(typeof p.hash).toBe('bigint');
      expect(p.lines.length).toBeGreaterThan(0);
      expect(p.lines.every((line) => line >= 1 && line <= 4)).toBe(true);
    }
  });

  it('a program shorter than k still gets one fingerprint', () => {
    expect(fingerprints(tokenize('PYTHON', 'print(1)'), 8, 4)).toHaveLength(1);
    expect(fingerprints([], 8, 4)).toEqual([]);
  });
});

describe('similarity', () => {
  const score = (lang: Parameters<typeof tokenize>[0], a: string, b: string) =>
    similarity(fingerprints(tokenize(lang, a)), fingerprints(tokenize(lang, b)));

  it('renamed identifiers plus reformatting score >= 0.9 (C++)', () => {
    expect(score('CPP', CPP_ORIGINAL, CPP_RENAMED_REFORMATTED)).toBeGreaterThanOrEqual(0.9);
  });

  it('renamed identifiers plus reformatting score >= 0.9 (Python)', () => {
    expect(score('PYTHON', PY_ORIGINAL, PY_RENAMED)).toBeGreaterThanOrEqual(0.9);
  });

  it('comment-only changes score exactly 1.0', () => {
    expect(score('CPP', CPP_ORIGINAL, CPP_COMMENTED)).toBe(1);
  });

  it('two unrelated solutions score < 0.3', () => {
    expect(score('CPP', CPP_ORIGINAL, CPP_UNRELATED)).toBeLessThan(0.3);
    expect(score('PYTHON', PY_ORIGINAL, PY_UNRELATED)).toBeLessThan(0.3);
  });

  it('is 0 when either side has no fingerprints', () => {
    expect(similarity([], fingerprints(tokenize('CPP', CPP_ORIGINAL)))).toBe(0);
  });

  it('matchedLines reports the lines covered by shared fingerprints on both sides', () => {
    const a = fingerprints(tokenize('CPP', CPP_ORIGINAL));
    const b = fingerprints(tokenize('CPP', CPP_COMMENTED));
    const lines = matchedLines(a, b);
    expect(lines.a.length).toBeGreaterThan(5);
    expect(lines.b.length).toBeGreaterThan(5);
    // Pure comment lines of B are never matched.
    expect(lines.b).not.toContain(4);
    expect(lines.b).not.toContain(11);
    expect([...lines.a].sort((x, y) => x - y)).toEqual(lines.a);
    expect(new Set(lines.a).size).toBe(lines.a.length);
  });
});
