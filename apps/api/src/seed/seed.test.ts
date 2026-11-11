import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getRedis } from '../lib/redis';
import { fingerprints, similarity, tokenize } from '../modules/plagiarism/winnow';
import { GEN_COMMAND, SeedDataError, assertHiddenTests, lf } from './problems';
import { createRng } from './rng';
import { clearScoreboardCaches } from './run';
import { simulateContest, simulatePractice, type SimProblem } from './simulate';
import {
  breakSource,
  diversify,
  isScaffolding,
  plagiarise,
  renameIdentifiers,
  type SeedLanguage,
} from './variants';

const SEED_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'seed', 'problems');
const ref = (slug: string, file: string) => lf(readFileSync(join(SEED_DIR, slug, file), 'utf8'));

const sim = (language: SeedLanguage, a: string, b: string) =>
  similarity(fingerprints(tokenize(language, a)), fingerprints(tokenize(language, b)));

describe('source variants', () => {
  const cases: [SeedLanguage, string][] = [
    ['PYTHON', ref('tandem-kayaks', 'ref.py')],
    ['PYTHON', ref('lantern-spacing', 'ref.py')],
    ['PYTHON', ref('night-ferries', 'wrong.py')],
    ['CPP', ref('tandem-kayaks', 'ref.cpp')],
    ['CPP', ref('lantern-spacing', 'ref.cpp')],
    ['CPP', ref('night-ferries', 'ref.cpp')],
  ];

  it.each(cases)(
    '%s: deleting the scaffolding restores the original source',
    (language, source) => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const variant = diversify(source, language, createRng(seed));
        expect(variant).not.toBe(source);
        const restored = variant
          .split('\n')
          .filter((line) => !isScaffolding(line, language))
          .join('\n');
        // The header is added after the last import / using line together with one blank line.
        expect(restored.replace(/\n\n(?=\S)/g, '\n').replace(/\n+/g, '\n')).toBe(
          source.replace(/\n+/g, '\n'),
        );
      }
    },
  );

  it('is deterministic for a seed and different across seeds', () => {
    const source = ref('tandem-kayaks', 'ref.py');
    expect(diversify(source, 'PYTHON', createRng(7))).toBe(
      diversify(source, 'PYTHON', createRng(7)),
    );
    expect(diversify(source, 'PYTHON', createRng(7))).not.toBe(
      diversify(source, 'PYTHON', createRng(8)),
    );
  });

  it('keeps independent submissions well below the 0.6 plagiarism threshold', () => {
    for (const [language, source] of cases) {
      const variants = Array.from({ length: 8 }, (_, i) =>
        diversify(source, language, createRng(100 + i)),
      );
      let worst = 0;
      for (let i = 0; i < variants.length; i += 1) {
        for (let j = i + 1; j < variants.length; j += 1) {
          worst = Math.max(worst, sim(language, variants[i], variants[j]));
        }
      }
      expect(worst, `${language} ${source.slice(0, 30)}`).toBeLessThan(0.6);
    }
  });

  it('a renamed copy is still a plagiarism hit', () => {
    const source = ref('tandem-kayaks', 'ref.py');
    const original = diversify(source, 'PYTHON', createRng(1));
    const copy = plagiarise(
      original,
      'PYTHON',
      { data: 'tokens', cap: 'limit', w: 'weights', pairs: 'count', i: 'lo', j: 'hi' },
      createRng(2),
    );
    expect(copy).not.toBe(original);
    expect(copy).toContain('tokens');
    expect(sim('PYTHON', original, copy)).toBeGreaterThanOrEqual(0.8);
  });

  it('renames whole words only, never inside strings or comments', () => {
    const source = 'x = 1  # x here\nprint("x", xs)\n';
    expect(renameIdentifiers(source, 'PYTHON', { x: 'y' })).toBe(
      'y = 1  # x here\nprint("x", xs)\n',
    );
    expect(renameIdentifiers('int x = 0; // x\ncout << "x";', 'CPP', { x: 'v' })).toBe(
      'int v = 0; // x\ncout << "x";',
    );
  });

  it('breakSource gives a source that differs from the original and a compiler message', () => {
    for (const [language, source] of cases) {
      const broken = breakSource(source, language, createRng(3));
      expect(broken.source).not.toBe(source);
      expect(broken.compileOutput).toMatch(
        language === 'PYTHON' ? /SyntaxError/ : /error: expected/,
      );
    }
  });
});

describe('simulation', () => {
  const problems: SimProblem[] = [
    { slug: 'a', difficulty: 'EASY', failures: ['WA'] },
    { slug: 'b', difficulty: 'EASY', failures: ['TLE'] },
    { slug: 'c', difficulty: 'MEDIUM', failures: ['WA', 'TLE'] },
    { slug: 'd', difficulty: 'MEDIUM', failures: ['WA'] },
    { slug: 'e', difficulty: 'HARD', failures: ['TLE'] },
  ];
  const users = Array.from({ length: 25 }, (_, i) => ({
    key: `u${i}`,
    skill: 0.1 + (i / 24) * 0.85,
  }));

  it('contest attempts stay in the window, every user submits, stronger users solve more', () => {
    const attempts = simulateContest(createRng(5), users, problems, 120);
    expect(attempts.every((a) => a.minute >= 0 && a.minute < 120)).toBe(true);
    expect(new Set(attempts.map((a) => a.user)).size).toBe(users.length);
    const solved = (keys: string[]) =>
      attempts.filter((a) => a.outcome === 'AC' && keys.includes(a.user)).length;
    const weak = users.slice(0, 8).map((u) => u.key);
    const strong = users.slice(-8).map((u) => u.key);
    expect(solved(strong)).toBeGreaterThan(solved(weak));
    // Failing attempts only use the failure modes a problem ships.
    for (const attempt of attempts) {
      const problem = problems.find((p) => p.slug === attempt.problem) as SimProblem;
      if (attempt.outcome === 'WA' || attempt.outcome === 'TLE') {
        expect(problem.failures).toContain(attempt.outcome);
      }
    }
  });

  it('practice attempts respect publication time and never solve a problem twice by accident', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const open = new Date('2026-11-05T00:00:00Z');
    const practice = simulatePractice(
      createRng(9),
      users,
      problems.map((p) => ({ ...p, availableFrom: open })),
      { now, horizonDays: 175 },
    );
    expect(practice.length).toBeGreaterThan(users.length);
    expect(practice.every((a) => a.at >= open && a.at < now)).toBe(true);
  });
});

describe('hidden-test guard', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function fakeRoot(testCount: number, withOutputs = true): string {
    const root = mkdtempSync(join(tmpdir(), 'arbiter-seed-'));
    dirs.push(root);
    const slug = join(root, 'demo-problem');
    mkdirSync(join(slug, 'tests'), { recursive: true });
    writeFileSync(join(slug, 'meta.json'), '{"slug":"demo-problem"}');
    for (let i = 1; i <= testCount; i += 1) {
      const name = String(i).padStart(2, '0');
      writeFileSync(join(slug, 'tests', `${name}.in`), '1\n');
      if (withOutputs) writeFileSync(join(slug, 'tests', `${name}.out`), '1\n');
    }
    return root;
  }

  it('passes when every test is present', () => {
    expect(assertHiddenTests(fakeRoot(12))).toEqual(['demo-problem']);
  });

  it('fails fast with the regeneration command when hidden tests are missing', () => {
    expect(() => assertHiddenTests(fakeRoot(2))).toThrow(SeedDataError);
    expect(() => assertHiddenTests(fakeRoot(2))).toThrow(GEN_COMMAND);
  });

  it('fails when an expected output is missing, and when a pinned checksum file is gone', () => {
    expect(() => assertHiddenTests(fakeRoot(12, false))).toThrow(/problems:gen/);
    const root = fakeRoot(12);
    writeFileSync(join(root, 'CHECKSUMS.sha256'), `${'0'.repeat(64)} *demo-problem/tests/13.in\n`);
    expect(() => assertHiddenTests(root)).toThrow(/13\.in/);
  });
});

describe('clearScoreboardCaches', () => {
  it('deletes every contest scoreboard key (including the lock) and leaves other keys alone', async () => {
    const redis = getRedis();
    const id = `seedtest${Date.now()}`;
    const scoreboard = ['rank', 'rows', 'updatedAt', 'lock'].map((part) => `contest:${id}:${part}`);
    const others = [`contest:${id}:other`, `bull:${id}:wait`, `sessions:${id}`];
    await Promise.all([...scoreboard, ...others].map((key) => redis.set(key, '1')));
    try {
      await clearScoreboardCaches();
      expect(await redis.exists(...scoreboard)).toBe(0);
      expect(await redis.exists(...others)).toBe(others.length);
    } finally {
      await redis.del(...scoreboard, ...others);
    }
  });
});
