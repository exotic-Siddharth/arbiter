import { describe, expect, it } from 'vitest';
import { LANGUAGE_CONFIG, containerDeadlineMs, deriveLimits } from './languages';

const problem = { timeLimitMs: 1000, memoryLimitMb: 256 };

describe('deriveLimits', () => {
  it('uses the base limits for C++', () => {
    expect(deriveLimits(problem, 'CPP')).toEqual({
      cpuLimitMs: 1000,
      wallLimitMs: 3000,
      memoryLimitKb: 256 * 1024,
      containerMemoryMb: 512,
    });
  });

  it('gives Java 2x time and 64 MB overhead', () => {
    expect(deriveLimits(problem, 'JAVA')).toEqual({
      cpuLimitMs: 2000,
      wallLimitMs: 5000,
      memoryLimitKb: 320 * 1024,
      containerMemoryMb: 576,
    });
  });

  it('gives Python 3x time and 16 MB overhead', () => {
    expect(deriveLimits(problem, 'PYTHON')).toEqual({
      cpuLimitMs: 3000,
      wallLimitMs: 7000,
      memoryLimitKb: 272 * 1024,
      containerMemoryMb: 528,
    });
  });

  it('gives JavaScript 2x time and 48 MB overhead', () => {
    expect(deriveLimits({ timeLimitMs: 500, memoryLimitMb: 128 }, 'JAVASCRIPT')).toEqual({
      cpuLimitMs: 1000,
      wallLimitMs: 3000,
      memoryLimitKb: 176 * 1024,
      containerMemoryMb: 432,
    });
  });

  it('caps the container memory at 2048 MB', () => {
    expect(deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 1800 }, 'CPP').containerMemoryMb).toBe(
      2048,
    );
    expect(deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 1024 }, 'JAVA')).toMatchObject({
      memoryLimitKb: 1088 * 1024,
      containerMemoryMb: 1344,
    });
    expect(deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 2048 }, 'JAVA').containerMemoryMb).toBe(
      2048,
    );
  });
});

describe('LANGUAGE_CONFIG', () => {
  it('puts the memory limit into the Java and Node run flags', () => {
    expect(LANGUAGE_CONFIG.JAVA.run(256)).toContain('-Xmx256m');
    expect(LANGUAGE_CONFIG.JAVA.run(256)).toContain('-XX:+ExitOnOutOfMemoryError');
    expect(LANGUAGE_CONFIG.JAVASCRIPT.run(128)).toContain('--max-old-space-size=128');
    expect(LANGUAGE_CONFIG.CPP.run(256)).toEqual(['./main']);
    expect(LANGUAGE_CONFIG.PYTHON.run(256)).toEqual(['python3', '-B', 'main.py']);
  });

  it('applies RLIMIT_AS to C++ only', () => {
    expect(
      Object.entries(LANGUAGE_CONFIG)
        .filter(([, config]) => config.addressSpaceLimit)
        .map(([id]) => id),
    ).toEqual(['CPP']);
  });
});

describe('containerDeadlineMs', () => {
  it('is compile 20 s + sum(wall + 1 s) + 10 s, capped at 15 minutes', () => {
    expect(containerDeadlineMs(3000, 5)).toBe(20_000 + 5 * 4000 + 10_000);
    expect(containerDeadlineMs(21_000, 100)).toBe(15 * 60_000);
  });
});
