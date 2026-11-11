import { describe, expect, it } from 'vitest';
import { pairTestFiles } from './pairTestFiles';

const files = (...names: string[]) => names.map((name) => ({ name }));

describe('pairTestFiles', () => {
  it('pairs 01.in/01.out and reports orphans', () => {
    const result = pairTestFiles(
      files(
        '02.out',
        '01.in',
        'README.md',
        '10.in',
        '01.out',
        '03.in',
        '02.in',
        '04.out',
        '10.out',
      ),
    );

    expect(result.pairs.map((pair) => [pair.name, pair.input.name, pair.output.name])).toEqual([
      ['01', '01.in', '01.out'],
      ['02', '02.in', '02.out'],
      ['10', '10.in', '10.out'],
    ]);
    expect(result.orphans.map((orphan) => [orphan.file.name, orphan.reason])).toEqual([
      ['03.in', 'missing-output'],
      ['04.out', 'missing-input'],
    ]);
    expect(result.ignored.map((file) => file.name)).toEqual(['README.md']);
  });

  it('sorts numerically (9 before 10) and accepts upper-case extensions', () => {
    const result = pairTestFiles(
      files('10.IN', '9.out', '10.OUT', '9.in', 'big-2.in', 'big-2.out'),
    );
    expect(result.pairs.map((pair) => pair.name)).toEqual(['9', '10', 'big-2']);
    expect(result.orphans).toEqual([]);
  });

  it('reports a second file with the same name as a duplicate', () => {
    const result = pairTestFiles(files('01.in', '01.out', '01.in'));
    expect(result.pairs.map((pair) => pair.name)).toEqual(['01']);
    expect(result.orphans.map((orphan) => [orphan.file.name, orphan.reason])).toEqual([
      ['01.in', 'duplicate'],
    ]);
  });
});
