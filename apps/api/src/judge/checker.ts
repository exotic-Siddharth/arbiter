import type { CheckerType } from '@arbiter/shared';

/**
 * Output checkers (spec section 8.6). They run in the worker, outside the sandbox, so a
 * submission can never see the expected output. Windows line endings never matter: `\r` is
 * whitespace for TOKENS/FLOAT and trailing whitespace for EXACT (Review Focus 1).
 */

export const DEFAULT_FLOAT_TOLERANCE = 1e-6;

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function tokens(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

function exactLines(text: string): string[] {
  const lines = text.split('\n').map((line) => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function floatTokenEqual(expected: string, actual: string, tolerance: number): boolean {
  if (expected === actual) return true;
  if (!NUMBER.test(expected) || !NUMBER.test(actual)) return false;
  const a = Number(actual);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  return diff <= tolerance || diff <= tolerance * Math.abs(b);
}

/** True when `actual` (program stdout) is accepted against `expected` under `type`. */
export function check(
  type: CheckerType,
  expected: string,
  actual: string,
  tolerance: number | null | undefined = DEFAULT_FLOAT_TOLERANCE,
): boolean {
  switch (type) {
    case 'TOKENS': {
      const want = tokens(expected);
      const got = tokens(actual);
      return want.length === got.length && want.every((token, i) => token === got[i]);
    }
    case 'EXACT': {
      const want = exactLines(expected);
      const got = exactLines(actual);
      return want.length === got.length && want.every((line, i) => line === got[i]);
    }
    case 'FLOAT': {
      const tol = tolerance ?? DEFAULT_FLOAT_TOLERANCE;
      const want = tokens(expected);
      const got = tokens(actual);
      return (
        want.length === got.length &&
        want.every((token, i) => floatTokenEqual(token, got[i] as string, tol))
      );
    }
  }
}
