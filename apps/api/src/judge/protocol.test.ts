import { LANGUAGE_IDS } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import { deriveLimits } from './languages';
import {
  ProtocolError,
  buildInitMessage,
  buildRunMessage,
  encodeMessage,
  parseHarnessEvent,
  stripBom,
} from './protocol';

const SECRET = 'EXPECTED-OUTPUT-7f3a9c';
const testCase = { ordinal: 3, input: '1 2\n', expectedOutput: `${SECRET}\n`, isSample: false };

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('protocol payloads', () => {
  it('init/run payloads never contain the expected output', () => {
    for (const language of LANGUAGE_IDS) {
      const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, language);
      const init = buildInitMessage({
        language,
        sourceCode: 'print(input())',
        memoryLimitMb: 256,
        limits,
      });
      const run = buildRunMessage(String(testCase.ordinal), testCase.input);
      const wire = encodeMessage(init) + encodeMessage(run);
      expect(wire).not.toContain(SECRET);
      expect(wire).not.toContain(b64(SECRET));
      expect(wire.toLowerCase()).not.toContain('expected');
      expect(Object.keys(run).sort()).toEqual(['id', 'input', 'type']);
      expect(Object.keys(init).sort()).toEqual(
        [
          'type',
          'sourceFile',
          'source',
          'compile',
          'run',
          'cpuLimitMs',
          'wallLimitMs',
          'memoryLimitKb',
          'outputLimitBytes',
          'rlimitAsKb',
        ].sort(),
      );
    }
  });

  it('builds the C++ init message of spec 8.4', () => {
    const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, 'CPP');
    const init = buildInitMessage({
      language: 'CPP',
      sourceCode: 'int main(){}',
      memoryLimitMb: 256,
      limits,
    });
    expect(init).toEqual({
      type: 'init',
      sourceFile: 'main.cpp',
      source: b64('int main(){}'),
      compile: ['g++', '-std=gnu++17', '-O2', '-pipe', '-o', 'main', 'main.cpp'],
      run: ['./main'],
      cpuLimitMs: 1000,
      wallLimitMs: 3000,
      memoryLimitKb: 262144,
      outputLimitBytes: 8388608,
      rlimitAsKb: 262144 + 65536,
    });
  });

  it('sets RLIMIT_AS for C++ only', () => {
    const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, 'JAVA');
    expect(
      buildInitMessage({ language: 'JAVA', sourceCode: 'x', memoryLimitMb: 256, limits })
        .rlimitAsKb,
    ).toBeNull();
  });

  it('strips a leading BOM from the source for every language', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(stripBom(`${bom}class Main {}`)).toBe('class Main {}');
    expect(stripBom('plain')).toBe('plain');
    for (const language of LANGUAGE_IDS) {
      const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, language);
      const init = buildInitMessage({
        language,
        sourceCode: `${bom}code\r\n`,
        memoryLimitMb: 256,
        limits,
      });
      expect(Buffer.from(init.source, 'base64').toString('utf8')).toBe('code\r\n');
    }
  });

  it('encodes run input bytes as base64', () => {
    expect(buildRunMessage('1', Buffer.from([0, 255]))).toEqual({
      type: 'run',
      id: '1',
      input: 'AP8=',
    });
  });
});

describe('parseHarnessEvent', () => {
  it('parses the harness events', () => {
    expect(parseHarnessEvent('{"type":"ready","version":1,"pid":7}')).toEqual({
      type: 'ready',
      version: 1,
      pid: 7,
    });
    expect(
      parseHarnessEvent(
        JSON.stringify({
          type: 'result',
          id: '7',
          status: 'OK',
          exitCode: 0,
          signal: null,
          cpuMs: 12,
          wallMs: 30,
          maxRssKb: 3456,
          stdout: b64('3\n'),
          stderr: '',
          outputLimitExceeded: false,
          wallKilled: false,
        }),
      ),
    ).toMatchObject({ type: 'result', id: '7', status: 'OK' });
  });

  it('rejects malformed or unknown output', () => {
    expect(() => parseHarnessEvent('hello')).toThrow(ProtocolError);
    expect(() => parseHarnessEvent('{"type":"ready","version":2,"pid":7}')).toThrow(ProtocolError);
    expect(() => parseHarnessEvent('{"type":"result","id":"1"}')).toThrow(ProtocolError);
    expect(() => parseHarnessEvent('[]')).toThrow(ProtocolError);
  });
});
