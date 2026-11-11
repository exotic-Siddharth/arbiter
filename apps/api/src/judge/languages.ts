import type { Language } from '@arbiter/shared';

/**
 * Judge-side language table (spec section 8.5): the single source of truth for sandbox file
 * names, compile/run commands, time multipliers and memory overheads. Display metadata and
 * templates live in packages/shared (LANGUAGES).
 */
export interface LanguageConfig {
  /** File the harness writes into /work. */
  sourceFile: string;
  /** Compile command (runs as runner in /work), or null when there is no compile step. */
  compile: string[] | null;
  /** Run command; `memoryLimitMb` is the problem's limit ({ML} in the spec). */
  run(memoryLimitMb: number): string[];
  timeMultiplier: number;
  memoryOverheadMb: number;
  /** RLIMIT_AS is applied to CPP only (R17). */
  addressSpaceLimit: boolean;
}

export const LANGUAGE_CONFIG: Record<Language, LanguageConfig> = {
  CPP: {
    sourceFile: 'main.cpp',
    compile: ['g++', '-std=gnu++17', '-O2', '-pipe', '-o', 'main', 'main.cpp'],
    run: () => ['./main'],
    timeMultiplier: 1,
    memoryOverheadMb: 0,
    addressSpaceLimit: true,
  },
  PYTHON: {
    sourceFile: 'main.py',
    compile: ['python3', '-m', 'py_compile', 'main.py'],
    run: () => ['python3', '-B', 'main.py'],
    timeMultiplier: 3,
    memoryOverheadMb: 16,
    addressSpaceLimit: false,
  },
  JAVA: {
    sourceFile: 'Main.java',
    compile: ['javac', '-encoding', 'UTF-8', '-d', '.', 'Main.java'],
    run: (memoryLimitMb) => [
      'java',
      `-Xmx${memoryLimitMb}m`,
      '-Xss64m',
      '-XX:+UseSerialGC',
      '-XX:TieredStopAtLevel=1',
      '-XX:-UsePerfData',
      '-XX:+ExitOnOutOfMemoryError',
      '-cp',
      '.',
      'Main',
    ],
    timeMultiplier: 2,
    memoryOverheadMb: 64,
    addressSpaceLimit: false,
  },
  JAVASCRIPT: {
    sourceFile: 'main.js',
    compile: ['node', '--check', 'main.js'],
    run: (memoryLimitMb) => [
      'node',
      `--max-old-space-size=${memoryLimitMb}`,
      '--stack-size=65500',
      'main.js',
    ],
    timeMultiplier: 2,
    memoryOverheadMb: 48,
    addressSpaceLimit: false,
  },
};

/** Hard cap of the container memory limit (spec section 8.2). */
export const CONTAINER_MEMORY_CAP_MB = 2048;
/** Headroom above the program's limit for the harness, compiler and tmpfs pages. */
export const CONTAINER_MEMORY_HEADROOM_MB = 256;
/** RLIMIT_AS slack above memoryLimitKb for CPP (spec section 8.3). */
export const ADDRESS_SPACE_SLACK_KB = 64 * 1024;
/** Stdout cap per test; more is OLE (spec section 8.3). */
export const OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

export interface ProblemLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface DerivedLimits {
  cpuLimitMs: number;
  wallLimitMs: number;
  memoryLimitKb: number;
  containerMemoryMb: number;
}

/** Per-test limits for a language (spec sections 8.2 and 8.5). */
export function deriveLimits(problem: ProblemLimits, language: Language): DerivedLimits {
  const config = LANGUAGE_CONFIG[language];
  const cpuLimitMs = problem.timeLimitMs * config.timeMultiplier;
  return {
    cpuLimitMs,
    wallLimitMs: cpuLimitMs * 2 + 1000,
    memoryLimitKb: (problem.memoryLimitMb + config.memoryOverheadMb) * 1024,
    containerMemoryMb: Math.min(
      problem.memoryLimitMb + config.memoryOverheadMb + CONTAINER_MEMORY_HEADROOM_MB,
      CONTAINER_MEMORY_CAP_MB,
    ),
  };
}

/** Compile phase budget inside the overall container deadline (spec section 8.4). */
export const COMPILE_BUDGET_MS = 20_000;
/** Upper bound of any container's lifetime; the janitor removes anything older (R17). */
export const MAX_CONTAINER_LIFETIME_MS = 15 * 60_000;

/** Overall container deadline: compile 20 s + sum(wall + 1 s) + 10 s, capped (spec 8.4). */
export function containerDeadlineMs(wallLimitMs: number, testCount: number): number {
  return Math.min(
    COMPILE_BUDGET_MS + testCount * (wallLimitMs + 1000) + 10_000,
    MAX_CONTAINER_LIFETIME_MS,
  );
}
