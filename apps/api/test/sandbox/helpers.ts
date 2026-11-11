import type { Language } from '@arbiter/shared';
import { env } from '../../src/config/env';
import { deriveLimits } from '../../src/judge/languages';
import {
  PREFIX_LABEL,
  SANDBOX_LABEL,
  SandboxSession,
  runDocker,
  type CompileResult,
  type RawResult,
} from '../../src/judge/sandbox';

/** Real-Docker helpers for the sandbox tests (R20). Containers carry this file's QUEUE_PREFIX. */

export interface SandboxRun {
  harnessPid: number;
  compiled: CompileResult;
  results: RawResult[];
}

export interface RunOptions {
  timeLimitMs?: number;
  memoryLimitMb?: number;
  /** Inputs; a function gets the harness pid (attack tests). */
  inputs?: (string | ((harnessPid: number) => string))[];
}

/** Start a container, compile `source`, run every input in order, close the container. */
export async function runInSandbox(
  language: Language,
  source: string,
  { timeLimitMs = 1000, memoryLimitMb = 256, inputs = [''] }: RunOptions = {},
): Promise<SandboxRun> {
  const limits = deriveLimits({ timeLimitMs, memoryLimitMb }, language);
  const session = await SandboxSession.start({
    jobId: `test-${language.toLowerCase()}`,
    language,
    sourceCode: source,
    memoryLimitMb,
    limits,
    testCount: inputs.length,
  });
  try {
    const compiled = await session.compile();
    const results: RawResult[] = [];
    if (compiled.ok) {
      for (const [index, input] of inputs.entries()) {
        const text = typeof input === 'function' ? input(session.harnessPid) : input;
        results.push(await session.runTest(String(index + 1), text));
      }
    }
    return { harnessPid: session.harnessPid, compiled, results };
  } finally {
    await session.close();
  }
}

/** Sandbox containers (running or not) with this test file's prefix label. */
export async function ownContainers(): Promise<string[]> {
  const out = await runDocker(env.DOCKER_BIN, [
    'ps',
    '-aq',
    '--filter',
    `label=${SANDBOX_LABEL}=1`,
    '--filter',
    `label=${PREFIX_LABEL}=${env.QUEUE_PREFIX}`,
  ]);
  return out.split(/\s+/).filter(Boolean);
}

/** --rm removal is asynchronous: wait until no container of ours is left (or time out). */
export async function waitForNoContainers(timeoutMs = 20_000): Promise<string[]> {
  const until = Date.now() + timeoutMs;
  let left = await ownContainers();
  while (left.length > 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    left = await ownContainers();
  }
  return left;
}

export const stdoutOf = (result: RawResult | undefined) => result?.stdout.toString('utf8') ?? '';
