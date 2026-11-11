import type { Verdict } from '@arbiter/shared';

/** Raw status of one executed test (spec section 8.3). */
export type RawStatus = 'OK' | 'TLE' | 'MLE' | 'RE' | 'OLE';

/** What the harness measured for one run (protocol `result`, payloads decoded). */
export interface RawFacts {
  exitCode: number | null;
  /** Signal name such as "SIGKILL", or null. */
  signal: string | null;
  cpuMs: number;
  wallMs: number;
  maxRssKb: number;
  /** Last 2 KB of stderr. */
  stderr: Buffer;
  outputLimitExceeded: boolean;
  wallKilled: boolean;
}

/** Limits the facts are judged against. */
export interface ClassifyLimits {
  cpuLimitMs: number;
  memoryLimitKb: number;
  containerMemoryKb: number;
  /** Java exits with code 3 on OutOfMemoryError (-XX:+ExitOnOutOfMemoryError). */
  isJava: boolean;
}

export const MLE_STDERR_PATTERN =
  /std::bad_alloc|MemoryError|OutOfMemoryError|JavaScript heap out of memory|Array buffer allocation failed/;

/**
 * Classify a run, checking OLE > MLE > TLE > RE > OK (spec 8.3 as patched by R17). The harness
 * applies the same rules; the worker re-derives the status from the reported facts so the
 * mapping is unit-tested and stays authoritative on the trusted side.
 */
export function classifyRaw(facts: RawFacts, limits: ClassifyLimits): RawStatus {
  if (facts.outputLimitExceeded) return 'OLE';
  const failed = facts.signal !== null || (facts.exitCode !== null && facts.exitCode !== 0);
  if (facts.maxRssKb > limits.memoryLimitKb) return 'MLE';
  if (facts.signal === 'SIGKILL' && facts.maxRssKb >= 0.9 * limits.containerMemoryKb) return 'MLE';
  if (failed && MLE_STDERR_PATTERN.test(facts.stderr.toString('latin1'))) return 'MLE';
  if (limits.isJava && facts.exitCode === 3) return 'MLE';
  if (facts.cpuMs > limits.cpuLimitMs || facts.wallKilled || facts.signal === 'SIGXCPU') {
    return 'TLE';
  }
  if (failed) return 'RE';
  return 'OK';
}

/** Verdict of one test: a raw OK is AC or WA by the checker; other statuses map 1:1. */
export function toVerdict(raw: { status: RawStatus }, passed: boolean): Verdict {
  switch (raw.status) {
    case 'OK':
      return passed ? 'AC' : 'WA';
    case 'TLE':
    case 'MLE':
    case 'RE':
    case 'OLE':
      return raw.status;
  }
}
