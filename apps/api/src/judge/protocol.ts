import type { Language } from '@arbiter/shared';
import { z } from 'zod';
import {
  ADDRESS_SPACE_SLACK_KB,
  LANGUAGE_CONFIG,
  OUTPUT_LIMIT_BYTES,
  type DerivedLimits,
} from './languages';

/**
 * JSON-lines protocol between the worker and sandbox/harness.py (spec section 8.4). All byte
 * payloads are base64. The builders below are the only way messages are made, and they take
 * no expected output at all: expected outputs never enter the container.
 */
export const PROTOCOL_VERSION = 1;

const BOM = String.fromCharCode(0xfeff);

export interface InitMessage {
  type: 'init';
  sourceFile: string;
  source: string;
  compile: string[] | null;
  run: string[];
  cpuLimitMs: number;
  wallLimitMs: number;
  memoryLimitKb: number;
  outputLimitBytes: number;
  /** RLIMIT_AS for the program (CPP only, R17); null = no address-space limit. */
  rlimitAsKb: number | null;
}

export interface RunMessage {
  type: 'run';
  id: string;
  input: string;
}

export interface ExitMessage {
  type: 'exit';
}

export type WorkerMessage = InitMessage | RunMessage | ExitMessage;

/** The worker strips a leading UTF-8 BOM for every language (javac rejects BOMs, R17). */
export function stripBom(source: string): string {
  return source.startsWith(BOM) ? source.slice(BOM.length) : source;
}

export interface InitOptions {
  language: Language;
  sourceCode: string;
  /** The problem's memoryLimitMb ({ML} in the Java and Node run flags). */
  memoryLimitMb: number;
  limits: DerivedLimits;
}

export function buildInitMessage({
  language,
  sourceCode,
  memoryLimitMb,
  limits,
}: InitOptions): InitMessage {
  const config = LANGUAGE_CONFIG[language];
  return {
    type: 'init',
    sourceFile: config.sourceFile,
    source: Buffer.from(stripBom(sourceCode), 'utf8').toString('base64'),
    compile: config.compile ? [...config.compile] : null,
    run: config.run(memoryLimitMb),
    cpuLimitMs: limits.cpuLimitMs,
    wallLimitMs: limits.wallLimitMs,
    memoryLimitKb: limits.memoryLimitKb,
    outputLimitBytes: OUTPUT_LIMIT_BYTES,
    rlimitAsKb: config.addressSpaceLimit ? limits.memoryLimitKb + ADDRESS_SPACE_SLACK_KB : null,
  };
}

/** A test run: only the input goes in. */
export function buildRunMessage(id: string, input: Buffer | string): RunMessage {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return { type: 'run', id, input: bytes.toString('base64') };
}

export function encodeMessage(message: WorkerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

const Base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64');
const Count = z.number().int().nonnegative();

const ReadyEvent = z.object({
  type: z.literal('ready'),
  version: z.literal(PROTOCOL_VERSION),
  pid: z.number().int().positive(),
});
const CompiledEvent = z.object({
  type: z.literal('compiled'),
  ok: z.boolean(),
  output: Base64,
  timeMs: Count,
});
const ResultEvent = z.object({
  type: z.literal('result'),
  id: z.string(),
  status: z.enum(['OK', 'TLE', 'MLE', 'RE', 'OLE']),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  cpuMs: Count,
  wallMs: Count,
  maxRssKb: Count,
  stdout: Base64,
  stderr: Base64,
  outputLimitExceeded: z.boolean(),
  wallKilled: z.boolean(),
});
const ErrorEvent = z.object({ type: z.literal('error'), message: z.string() });

export const HarnessEventSchema = z.discriminatedUnion('type', [
  ReadyEvent,
  CompiledEvent,
  ResultEvent,
  ErrorEvent,
]);
export type HarnessEvent = z.infer<typeof HarnessEventSchema>;
export type ResultEvent = z.infer<typeof ResultEvent>;

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

/** Parse one harness stdout line; anything malformed is a ProtocolError (the job ends IE). */
export function parseHarnessEvent(line: string): HarnessEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new ProtocolError(`malformed harness output: ${line.slice(0, 120)}`);
  }
  const result = HarnessEventSchema.safeParse(value);
  if (!result.success) {
    throw new ProtocolError(
      `unexpected harness event: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }
  return result.data;
}
