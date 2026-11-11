import { describe, expect, it } from 'vitest';
import { classifyRaw, toVerdict, type ClassifyLimits, type RawFacts } from './verdict';

const limits: ClassifyLimits = {
  cpuLimitMs: 1000,
  memoryLimitKb: 256 * 1024,
  containerMemoryKb: 512 * 1024,
  isJava: false,
};

const ok: RawFacts = {
  exitCode: 0,
  signal: null,
  cpuMs: 10,
  wallMs: 20,
  maxRssKb: 4000,
  stderr: Buffer.alloc(0),
  outputLimitExceeded: false,
  wallKilled: false,
};

const facts = (overrides: Partial<RawFacts>): RawFacts => ({ ...ok, ...overrides });

describe('classifyRaw', () => {
  it('is OK for a clean exit within limits', () => {
    expect(classifyRaw(ok, limits)).toBe('OK');
  });

  it('applies the precedence OLE > MLE > TLE > RE', () => {
    const everything = facts({
      outputLimitExceeded: true,
      maxRssKb: 300 * 1024,
      cpuMs: 5000,
      wallKilled: true,
      signal: 'SIGKILL',
      exitCode: null,
    });
    expect(classifyRaw(everything, limits)).toBe('OLE');
    expect(classifyRaw({ ...everything, outputLimitExceeded: false }, limits)).toBe('MLE');
    expect(classifyRaw({ ...everything, outputLimitExceeded: false, maxRssKb: 1000 }, limits)).toBe(
      'TLE',
    );
    expect(classifyRaw(facts({ exitCode: 1 }), limits)).toBe('RE');
    expect(classifyRaw(facts({ cpuMs: 1001, exitCode: 1 }), limits)).toBe('TLE');
    expect(classifyRaw(facts({ maxRssKb: 256 * 1024 + 1, exitCode: 1 }), limits)).toBe('MLE');
  });

  it('is MLE for SIGKILL near the container limit (cgroup OOM kill)', () => {
    const killed = facts({ signal: 'SIGKILL', exitCode: null, maxRssKb: 0 });
    expect(classifyRaw({ ...killed, maxRssKb: 0.95 * 512 * 1024 }, limits)).toBe('MLE');
    expect(
      classifyRaw({ ...killed, maxRssKb: 0.95 * 512 * 1024 }, { ...limits, memoryLimitKb: 1e9 }),
    ).toBe('MLE');
    expect(classifyRaw({ ...killed, maxRssKb: 1000 }, limits)).toBe('RE');
  });

  it('is MLE when a failing run reports an out-of-memory error on stderr', () => {
    for (const message of [
      "terminate called after throwing an instance of 'std::bad_alloc'",
      'MemoryError',
      'java.lang.OutOfMemoryError: Java heap space',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      'RangeError: Array buffer allocation failed',
    ]) {
      const stderr = Buffer.from(`...\n${message}\n`);
      expect(classifyRaw(facts({ signal: 'SIGABRT', exitCode: null, stderr }), limits)).toBe('MLE');
      expect(classifyRaw(facts({ exitCode: 1, stderr }), limits)).toBe('MLE');
      // A clean exit that merely prints the words is not a memory error.
      expect(classifyRaw(facts({ stderr }), limits)).toBe('OK');
    }
  });

  it('is MLE for Java exit code 3 only', () => {
    expect(classifyRaw(facts({ exitCode: 3 }), { ...limits, isJava: true })).toBe('MLE');
    expect(classifyRaw(facts({ exitCode: 3 }), limits)).toBe('RE');
  });

  it('is TLE on CPU over the limit, a wall kill, or SIGXCPU', () => {
    expect(classifyRaw(facts({ cpuMs: 1001 }), limits)).toBe('TLE');
    expect(classifyRaw(facts({ cpuMs: 1000 }), limits)).toBe('OK');
    expect(
      classifyRaw(facts({ wallKilled: true, signal: 'SIGKILL', exitCode: null }), limits),
    ).toBe('TLE');
    expect(classifyRaw(facts({ signal: 'SIGXCPU', exitCode: null }), limits)).toBe('TLE');
  });

  it('is RE for any other non-zero exit or signal', () => {
    expect(classifyRaw(facts({ exitCode: 139 }), limits)).toBe('RE');
    expect(classifyRaw(facts({ signal: 'SIGSEGV', exitCode: null }), limits)).toBe('RE');
    expect(classifyRaw(facts({ signal: 'SIGXFSZ', exitCode: null }), limits)).toBe('RE');
  });
});

describe('toVerdict', () => {
  it('maps a raw OK through the checker result', () => {
    expect(toVerdict({ status: 'OK' }, true)).toBe('AC');
    expect(toVerdict({ status: 'OK' }, false)).toBe('WA');
  });

  it('maps non-OK statuses 1:1 whatever the checker says', () => {
    for (const status of ['TLE', 'MLE', 'RE', 'OLE'] as const) {
      expect(toVerdict({ status }, true)).toBe(status);
      expect(toVerdict({ status }, false)).toBe(status);
    }
  });
});
