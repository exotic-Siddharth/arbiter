import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { Language } from '@arbiter/shared';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { WORKER_ID } from './heartbeat';
import { containerDeadlineMs, type DerivedLimits } from './languages';
import { sandboxContainerStart } from './metrics';
import {
  ProtocolError,
  buildInitMessage,
  buildRunMessage,
  encodeMessage,
  parseHarnessEvent,
  type HarnessEvent,
  type WorkerMessage,
} from './protocol';
import { classifyRaw, type RawFacts, type RawStatus } from './verdict';

/** Labels on every sandbox container (R17); the janitor and the tests filter on them. */
export const SANDBOX_LABEL = 'arbiter.sandbox';
export const PREFIX_LABEL = 'arbiter.prefix';
export const WORKER_LABEL = 'arbiter.worker';
export const CONTAINER_NAME_PREFIX = 'arbiter-sbx-';

const READY_TIMEOUT_MS = 60_000;
const CLOSE_TIMEOUT_MS = 5_000;
const STDERR_KEEP = 4096;

/** The judge could not finish (Docker missing, image missing, crash, deadline, bad protocol). */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

export interface SandboxOptions {
  /** Used in the container name: arbiter-sbx-<jobId>-<rand6>. */
  jobId: string;
  language: Language;
  sourceCode: string;
  /** The problem's memoryLimitMb ({ML} for the Java and Node flags). */
  memoryLimitMb: number;
  limits: DerivedLimits;
  /** Tests this session will run (sizes the overall container deadline). */
  testCount: number;
  image?: string;
  dockerBin?: string;
  runtime?: string;
  prefix?: string;
  workerId?: string;
}

export interface CompileResult {
  ok: boolean;
  /** Compiler output, at most 16 KB (decoded as UTF-8). */
  output: string;
  timeMs: number;
}

export interface RawResult extends RawFacts {
  id: string;
  /** Status re-derived by the worker from the facts (authoritative). */
  status: RawStatus;
  /** Status the harness reported (same rules; kept for diagnostics). */
  harnessStatus: RawStatus;
  stdout: Buffer;
}

const containerName = (jobId: string) =>
  `${CONTAINER_NAME_PREFIX}${jobId.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 60)}-${randomBytes(3).toString('hex')}`;

/** docker run arguments of spec section 8.2 (plus --pull never, so a missing image fails fast). */
export function dockerRunArgs(options: {
  name: string;
  image: string;
  prefix: string;
  workerId: string;
  containerMemoryMb: number;
  runtime?: string;
}): string[] {
  const memory = `${options.containerMemoryMb}m`;
  return [
    'run',
    '--rm',
    '-i',
    '--init',
    '--pull',
    'never',
    '--name',
    options.name,
    '--label',
    `${SANDBOX_LABEL}=1`,
    '--label',
    `${PREFIX_LABEL}=${options.prefix}`,
    '--label',
    `${WORKER_LABEL}=${options.workerId}`,
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/work:rw,exec,nosuid,size=128m',
    '--tmpfs',
    '/tmp:rw,nosuid,size=32m',
    '--memory',
    memory,
    '--memory-swap',
    memory,
    '--cpus',
    '1',
    '--pids-limit',
    '128',
    '--cap-drop',
    'ALL',
    '--cap-add',
    'SETUID',
    '--cap-add',
    'SETGID',
    '--cap-add',
    'KILL',
    '--security-opt',
    'no-new-privileges',
    '--ulimit',
    'core=0',
    '--ulimit',
    'nofile=256:256',
    ...(options.runtime ? ['--runtime', options.runtime] : []),
    options.image,
  ];
}

/** A clear errorMessage for a docker CLI failure (spec 8.4: Docker or image missing -> IE). */
function describeDockerFailure(stderr: string, image: string, code: number | null): string {
  const tail = stderr.trim().slice(-500);
  if (/No such image|Unable to find image|pull access denied/i.test(stderr)) {
    return `Sandbox image "${image}" is not available on the Docker host (build it with npm run sandbox:build). ${tail}`;
  }
  if (
    /Cannot connect to the Docker daemon|error during connect|docker daemon is not running/i.test(
      stderr,
    )
  ) {
    return `Docker is not reachable: ${tail}`;
  }
  return `Sandbox container exited unexpectedly (code ${code ?? 'null'}): ${tail || 'no output'}`;
}

type Waiter = {
  accept: (event: HarnessEvent) => boolean;
  resolve: (event: HarnessEvent) => void;
  reject: (error: Error) => void;
};

/**
 * One sandbox container per job, driven over the JSON-lines protocol (spec 8.2 to 8.4):
 * start() waits for `ready`, compile() sends `init`, runTest() sends `run`, close() sends `exit`.
 * An overall deadline kills the container; every failure surfaces as SandboxError.
 */
export class SandboxSession {
  readonly name: string;
  harnessPid = 0;
  startSeconds = 0;

  private readonly child: ChildProcessWithoutNullStreams;
  private readonly options: SandboxOptions;
  private readonly image: string;
  private readonly dockerBin: string;
  private readonly backlog: HarnessEvent[] = [];
  private waiter: Waiter | null = null;
  private failure: SandboxError | null = null;
  private stderr = '';
  private exited = false;
  private readonly exitPromise: Promise<void>;
  private deadline: NodeJS.Timeout | null = null;

  private constructor(options: SandboxOptions) {
    this.options = options;
    this.image = options.image ?? env.SANDBOX_IMAGE;
    this.dockerBin = options.dockerBin ?? env.DOCKER_BIN;
    this.name = containerName(options.jobId);
    const args = dockerRunArgs({
      name: this.name,
      image: this.image,
      prefix: options.prefix ?? env.QUEUE_PREFIX,
      workerId: options.workerId ?? WORKER_ID,
      containerMemoryMb: options.limits.containerMemoryMb,
      runtime: options.runtime ?? env.SANDBOX_RUNTIME,
    });
    this.child = spawn(this.dockerBin, args, { stdio: 'pipe', windowsHide: true });
    this.exitPromise = new Promise((resolve) => {
      this.child.once('close', (code) => {
        this.exited = true;
        if (!this.failure) {
          this.fail(new SandboxError(describeDockerFailure(this.stderr, this.image, code)));
        }
        resolve();
      });
    });
    this.child.once('error', (error: NodeJS.ErrnoException) => {
      const message =
        error.code === 'ENOENT'
          ? `Docker CLI not found (DOCKER_BIN=${this.dockerBin})`
          : `Cannot run the Docker CLI: ${error.message}`;
      this.fail(new SandboxError(message));
      this.exited = true;
    });
    this.child.stdin.on('error', () => {
      // EPIPE after the container died: the close handler reports the failure.
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_KEEP);
    });
    const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => this.onLine(line));

    const deadlineMs =
      READY_TIMEOUT_MS + containerDeadlineMs(options.limits.wallLimitMs, options.testCount);
    this.deadline = setTimeout(() => {
      this.fail(new SandboxError(`Sandbox deadline of ${deadlineMs} ms exceeded`));
      void this.kill();
    }, deadlineMs);
    this.deadline.unref();
  }

  /** Spawn the container and wait for the harness `ready` message. */
  static async start(options: SandboxOptions): Promise<SandboxSession> {
    const session = new SandboxSession(options);
    const started = process.hrtime.bigint();
    try {
      const ready = await session.next('ready', READY_TIMEOUT_MS);
      if (ready.type === 'ready') session.harnessPid = ready.pid;
    } catch (error) {
      await session.close();
      throw error;
    }
    session.startSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    sandboxContainerStart.observe(session.startSeconds);
    return session;
  }

  /** Send `init` (source, commands, limits) and wait for `compiled`. */
  async compile(): Promise<CompileResult> {
    this.send(
      buildInitMessage({
        language: this.options.language,
        sourceCode: this.options.sourceCode,
        memoryLimitMb: this.options.memoryLimitMb,
        limits: this.options.limits,
      }),
    );
    const event = await this.next('compiled');
    if (event.type !== 'compiled') throw new SandboxError('unexpected harness event');
    return {
      ok: event.ok,
      output: Buffer.from(event.output, 'base64').toString('utf8'),
      timeMs: event.timeMs,
    };
  }

  /** Run one test on `input`; the expected output never leaves the worker. */
  async runTest(id: string, input: Buffer | string): Promise<RawResult> {
    this.send(buildRunMessage(id, input));
    const event = await this.next('result', undefined, (e) => e.type === 'result' && e.id === id);
    if (event.type !== 'result') throw new SandboxError('unexpected harness event');
    const facts: RawFacts = {
      exitCode: event.exitCode,
      signal: event.signal,
      cpuMs: event.cpuMs,
      wallMs: event.wallMs,
      maxRssKb: event.maxRssKb,
      stderr: Buffer.from(event.stderr, 'base64'),
      outputLimitExceeded: event.outputLimitExceeded,
      wallKilled: event.wallKilled,
    };
    const status = classifyRaw(facts, {
      cpuLimitMs: this.options.limits.cpuLimitMs,
      memoryLimitKb: this.options.limits.memoryLimitKb,
      containerMemoryKb: this.options.limits.containerMemoryMb * 1024,
      isJava: this.options.language === 'JAVA',
    });
    if (status !== event.status) {
      logger.warn(
        { container: this.name, harness: event.status, worker: status },
        'harness and worker classification differ',
      );
    }
    return {
      ...facts,
      id,
      status,
      harnessStatus: event.status,
      stdout: Buffer.from(event.stdout, 'base64'),
    };
  }

  /** Ask the harness to exit; kill the container if it does not go away in time. */
  async close(): Promise<void> {
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    if (!this.exited) {
      try {
        if (!this.failure) this.child.stdin.write(encodeMessage({ type: 'exit' }));
        this.child.stdin.end();
      } catch {
        // already closed
      }
      const timer = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), CLOSE_TIMEOUT_MS).unref(),
      );
      if (
        (await Promise.race([this.exitPromise.then(() => 'done' as const), timer])) === 'timeout'
      ) {
        await this.kill();
      }
    }
    if (!this.failure) this.failure = new SandboxError('sandbox session is closed');
  }

  private async kill(): Promise<void> {
    await runDocker(this.dockerBin, ['rm', '-f', this.name]).catch(() => undefined);
    if (!this.exited) this.child.kill('SIGKILL');
    await Promise.race([
      this.exitPromise,
      new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS).unref()),
    ]);
  }

  private send(message: WorkerMessage): void {
    if (this.failure) throw this.failure;
    this.child.stdin.write(encodeMessage(message));
  }

  private onLine(line: string): void {
    if (line.trim() === '') return;
    let event: HarnessEvent;
    try {
      event = parseHarnessEvent(line);
    } catch (error) {
      this.fail(new SandboxError((error as ProtocolError).message));
      void this.kill();
      return;
    }
    if (event.type === 'error') {
      this.fail(new SandboxError(`harness error: ${event.message}`));
      return;
    }
    const waiter = this.waiter;
    if (waiter && waiter.accept(event)) {
      this.waiter = null;
      waiter.resolve(event);
    } else {
      this.backlog.push(event);
    }
  }

  private fail(error: SandboxError): void {
    if (this.failure) return;
    this.failure = error;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }

  private next(
    type: HarnessEvent['type'],
    timeoutMs?: number,
    accept: (event: HarnessEvent) => boolean = (event) => event.type === type,
  ): Promise<HarnessEvent> {
    const queued = this.backlog.findIndex(accept);
    if (queued >= 0) {
      const [event] = this.backlog.splice(queued, 1);
      return Promise.resolve(event as HarnessEvent);
    }
    if (this.backlog.length > 0) {
      return Promise.reject(new SandboxError(`unexpected harness event ${this.backlog[0]?.type}`));
    }
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const done =
        <T>(fn: (value: T) => void) =>
        (value: T) => {
          if (timer) clearTimeout(timer);
          fn(value);
        };
      this.waiter = { accept, resolve: done(resolve), reject: done(reject) };
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          this.fail(new SandboxError(`no ${type} message from the sandbox within ${timeoutMs} ms`));
          void this.kill();
        }, timeoutMs);
        timer.unref();
      }
    });
  }
}

/** Run a short docker CLI command; resolves to stdout, rejects with stderr. */
export function runDocker(dockerBin: string, args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timer.unref();
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `docker ${args[0]} exited with ${code}`));
    });
  });
}
