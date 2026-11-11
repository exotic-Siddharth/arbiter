import type { Language, Verdict } from '@arbiter/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { check } from '../../src/judge/checker';
import { SandboxError, SandboxSession } from '../../src/judge/sandbox';
import { deriveLimits } from '../../src/judge/languages';
import { toVerdict } from '../../src/judge/verdict';
import { env } from '../../src/config/env';
import { runInSandbox, stdoutOf, waitForNoContainers } from './helpers';

/**
 * Real-Docker sandbox tests (spec section 8.7). Needs the arbiter-sandbox image
 * (env SANDBOX_IMAGE); run with `npm run test:sandbox` from the repo root.
 */

const SUM_INPUT = '1 2\n';
const SUM_EXPECTED = '3\n';

interface Programs {
  ac: string;
  wa: string;
  ce: string;
  re: string;
  tle: string;
  mle: string;
}

const PROGRAMS: Record<Language, Programs> = {
  CPP: {
    ac: '#include <cstdio>\nint main(){long long a,b;if(scanf("%lld %lld",&a,&b)!=2)return 1;printf("%lld\\n",a+b);}\n',
    wa: '#include <cstdio>\nint main(){long long a,b;if(scanf("%lld %lld",&a,&b)!=2)return 1;printf("%lld\\n",a-b);}\n',
    ce: 'int main( {\n',
    re: '#include <cstdlib>\nint main(){ return 3; }\n',
    tle: 'volatile unsigned long long x = 0;\nint main(){ for(;;) x++; }\n',
    mle: '#include <vector>\n#include <cstdio>\nint main(){ std::vector<char> v(1u << 30, 1); printf("%d\\n", v[12345]); }\n',
  },
  PYTHON: {
    ac: 'a, b = map(int, input().split())\nprint(a + b)\n',
    wa: 'a, b = map(int, input().split())\nprint(a - b)\n',
    ce: 'def f(:\n    pass\n',
    re: "raise ValueError('boom')\n",
    tle: 'while True:\n    pass\n',
    mle: 'x = [1] * (1 << 27)\nprint(len(x))\n',
  },
  JAVA: {
    ac: 'import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner s = new Scanner(System.in);\n    long a = s.nextLong(), b = s.nextLong();\n    System.out.println(a + b);\n  }\n}\n',
    wa: 'import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner s = new Scanner(System.in);\n    long a = s.nextLong(), b = s.nextLong();\n    System.out.println(a - b);\n  }\n}\n',
    ce: 'public class Main { void f( }\n',
    re: 'public class Main {\n  public static void main(String[] args) {\n    throw new RuntimeException("boom");\n  }\n}\n',
    tle: 'public class Main {\n  public static void main(String[] args) {\n    while (true) {}\n  }\n}\n',
    mle: 'public class Main {\n  public static void main(String[] args) {\n    byte[] b = new byte[1 << 30];\n    System.out.println(b.length);\n  }\n}\n',
  },
  JAVASCRIPT: {
    ac: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a + b);\n",
    wa: "const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);\nconsole.log(a - b);\n",
    ce: 'function (\n',
    re: "throw new Error('boom');\n",
    tle: 'for (;;) {}\n',
    mle: 'const a = [];\nfor (;;) a.push(new Array(1e6).fill(1.5));\n',
  },
};

async function verdictOf(
  language: Language,
  source: string,
  options: { timeLimitMs?: number; memoryLimitMb?: number } = {},
): Promise<Verdict> {
  const run = await runInSandbox(language, source, { ...options, inputs: [SUM_INPUT] });
  if (!run.compiled.ok) return 'CE';
  const raw = run.results[0]!;
  return toVerdict(raw, raw.status === 'OK' && check('TOKENS', SUM_EXPECTED, stdoutOf(raw)));
}

afterAll(async () => {
  expect(await waitForNoContainers()).toEqual([]);
});

describe.each(Object.keys(PROGRAMS) as Language[])('%s in the sandbox', (language) => {
  const programs = PROGRAMS[language];

  it('AC on a correct solution', async () => {
    expect(await verdictOf(language, programs.ac)).toBe('AC');
  });

  it('WA on a wrong answer', async () => {
    expect(await verdictOf(language, programs.wa)).toBe('WA');
  });

  it('CE on a syntax error, with the compiler output', async () => {
    const run = await runInSandbox(language, programs.ce);
    expect(run.compiled.ok).toBe(false);
    expect(run.compiled.output.length).toBeGreaterThan(0);
    expect(run.results).toEqual([]);
  });

  it('RE on a non-zero exit or an exception', async () => {
    expect(await verdictOf(language, programs.re)).toBe('RE');
  });

  it('TLE on an infinite loop', async () => {
    const started = Date.now();
    expect(await verdictOf(language, programs.tle, { timeLimitMs: 500 })).toBe('TLE');
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it('MLE when allocating 1 GB', async () => {
    expect(await verdictOf(language, programs.mle)).toBe('MLE');
  });
});

describe('Windows-pasted source (Review Focus 1)', () => {
  it('CPP source with CRLF and BOM is AC', async () => {
    const bom = String.fromCharCode(0xfeff);
    const source =
      bom +
      [
        '#include <iostream>',
        'using namespace std;',
        '// comment line with a trailing backslash is not used here',
        'int main() {',
        '    long long a, b;',
        '    cin >> a >> b;',
        '    cout << a + b << "\\r\\n";',
        '}',
        '',
      ].join('\r\n');
    expect(await verdictOf('CPP', source)).toBe('AC');
  });

  it('Java source with a BOM compiles', async () => {
    const bom = String.fromCharCode(0xfeff);
    expect(await verdictOf('JAVA', bom + PROGRAMS.JAVA.ac.replace(/\n/g, '\r\n'))).toBe('AC');
  });

  it('empty input and empty output are judged, not crashed (Review Focus 2)', async () => {
    const run = await runInSandbox('PYTHON', 'pass\n', { inputs: [''] });
    const raw = run.results[0]!;
    expect(raw.status).toBe('OK');
    expect(stdoutOf(raw)).toBe('');
    expect(toVerdict(raw, check('TOKENS', '', stdoutOf(raw)))).toBe('AC');
    expect(toVerdict(raw, check('TOKENS', '0\n', stdoutOf(raw)))).toBe('WA');
  });
});

describe('attacks (spec 8.7)', () => {
  it('fork bomb: RE or TLE within the deadline, nothing left behind', async () => {
    const started = Date.now();
    const run = await runInSandbox(
      'PYTHON',
      'import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n',
      { timeLimitMs: 1000, inputs: ['', ''] },
    );
    expect(['RE', 'TLE']).toContain(run.results[0]!.status);
    // The harness cleaned up: the next test in the same container still runs.
    expect(['RE', 'TLE']).toContain(run.results[1]!.status);
    expect(Date.now() - started).toBeLessThan(60_000);
    expect(await waitForNoContainers()).toEqual([]);
  });

  // A-05: the harness measures the whole process tree, not only the direct child. The forking
  // programs wait for their child with WNOWAIT (it stays a zombie, never reaped by the parent),
  // so wait4() on the direct child alone would not see the child's resources.
  it('memory of an unreaped child process counts: a forking allocator gets MLE', async () => {
    const source = [
      'import os',
      'pid = os.fork()',
      'if pid == 0:',
      '    b = bytearray(200 * 1024 * 1024)',
      '    for i in range(0, len(b), 4096):',
      '        b[i] = 1',
      '    print(3)',
      '    os._exit(0)',
      'os.waitid(os.P_PID, pid, os.WEXITED | os.WNOWAIT)',
      'os._exit(0)',
      '',
    ].join('\n');
    const run = await runInSandbox('PYTHON', source, { memoryLimitMb: 64, inputs: [SUM_INPUT] });
    const raw = run.results[0]!;
    expect(raw.maxRssKb).toBeGreaterThan(150 * 1024);
    expect(raw.status).toBe('MLE');
    expect(toVerdict(raw, true)).toBe('MLE');
  });

  it('memory of a child still running when the parent exits counts too', async () => {
    const source = [
      'import os, time',
      'if os.fork() == 0:',
      '    b = bytearray(200 * 1024 * 1024)',
      '    for i in range(0, len(b), 4096):',
      '        b[i] = 1',
      '    time.sleep(60)',
      '    os._exit(0)',
      'time.sleep(2)',
      'os._exit(0)',
      '',
    ].join('\n');
    const run = await runInSandbox('PYTHON', source, { memoryLimitMb: 64, inputs: [SUM_INPUT] });
    expect(run.results[0]!.status).toBe('MLE');
  });

  it('cpu time of an unreaped child process counts: a forking spinner gets TLE', async () => {
    const source = [
      'import os, time',
      'pid = os.fork()',
      'if pid == 0:',
      '    while time.process_time() < 1.5:',
      '        pass',
      '    os._exit(0)',
      'os.waitid(os.P_PID, pid, os.WEXITED | os.WNOWAIT)',
      'os._exit(0)',
      '',
    ].join('\n');
    const run = await runInSandbox('PYTHON', source, { timeLimitMs: 300, inputs: [SUM_INPUT] });
    const raw = run.results[0]!;
    expect(raw.cpuMs).toBeGreaterThan(900);
    expect(raw.status).toBe('TLE');
  });

  it('a harmless child that the parent waits for is still AC', async () => {
    const source = [
      'import os',
      'pid = os.fork()',
      'if pid == 0:',
      '    os._exit(0)',
      'os.waitpid(pid, 0)',
      'a, b = map(int, input().split())',
      'print(a + b)',
      '',
    ].join('\n');
    expect(await verdictOf('PYTHON', source)).toBe('AC');
  });

  it('sleep 100: TLE via the wall limit', async () => {
    const run = await runInSandbox('PYTHON', 'import time\ntime.sleep(100)\n', {
      timeLimitMs: 500,
    });
    const raw = run.results[0]!;
    expect(raw.status).toBe('TLE');
    expect(raw.wallKilled).toBe(true);
    expect(raw.wallMs).toBeLessThan(10_000);
  });

  it('100 MB of output: OLE', async () => {
    const run = await runInSandbox(
      'PYTHON',
      "import sys\nchunk = 'x' * 1_000_000\nfor _ in range(100):\n    sys.stdout.write(chunk)\n",
    );
    const raw = run.results[0]!;
    expect(raw.status).toBe('OLE');
    expect(raw.stdout.length).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('network connect to 1.1.1.1:53 fails', async () => {
    const run = await runInSandbox(
      'PYTHON',
      [
        'import socket',
        'try:',
        '    socket.create_connection(("1.1.1.1", 53), timeout=3)',
        '    print("CONNECTED")',
        'except OSError as error:',
        '    print("BLOCKED", error)',
        '',
      ].join('\n'),
    );
    const raw = run.results[0]!;
    expect(stdoutOf(raw)).not.toContain('CONNECTED');
    expect(raw.status === 'RE' || stdoutOf(raw).startsWith('BLOCKED')).toBe(true);
  });

  it('writing /etc/x or /judge/harness.py fails', async () => {
    const run = await runInSandbox(
      'PYTHON',
      [
        'for path in ("/etc/x", "/judge/harness.py"):',
        '    try:',
        '        with open(path, "a") as handle:',
        '            handle.write("pwned")',
        '        print("WROTE", path)',
        '    except OSError as error:',
        '        print("DENIED", path, type(error).__name__)',
        '',
      ].join('\n'),
    );
    const out = stdoutOf(run.results[0]);
    expect(out).toContain('DENIED /etc/x');
    expect(out).toContain('DENIED /judge/harness.py');
    expect(out).not.toContain('WROTE');
  });

  it('kill -9 <harnessPid> fails, kill -9 -1 kills only runner processes, the judge goes on', async () => {
    const run = await runInSandbox(
      'PYTHON',
      [
        'import os, signal, sys',
        'line = sys.stdin.readline().split()',
        'if line[0] == "harness":',
        '    try:',
        '        os.kill(int(line[1]), signal.SIGKILL)',
        '        print("KILLED")',
        '    except PermissionError:',
        '        print("DENIED")',
        'elif line[0] == "all":',
        // Linux never delivers kill(-1) to the caller itself, so a forked child sends it:
        // it reaches the program (runner) but not the root-owned harness or tini.
        '    import time',
        '    if os.fork() == 0:',
        '        os.kill(-1, signal.SIGKILL)',
        '        os._exit(0)',
        '    time.sleep(5)',
        '    print("SURVIVED")',
        'else:',
        '    print("ALIVE")',
        '',
      ].join('\n'),
      {
        inputs: [(pid) => `harness ${pid}\n`, 'all\n', 'ping\n'],
      },
    );
    expect(run.harnessPid).toBeGreaterThan(1);
    expect(run.results).toHaveLength(3);
    expect(stdoutOf(run.results[0])).toBe('DENIED\n');
    expect(run.results[0]!.status).toBe('OK');
    expect(run.results[1]!.status).toBe('RE');
    expect(run.results[1]!.signal).toBe('SIGKILL');
    expect(stdoutOf(run.results[2])).toBe('ALIVE\n');
  });

  it('reading /proc/<harnessPid>/fd and /proc/<harnessPid>/environ is denied', async () => {
    const run = await runInSandbox(
      'PYTHON',
      [
        'import os, sys',
        'pid = sys.stdin.readline().strip()',
        'try:',
        '    print("FD", os.listdir(f"/proc/{pid}/fd"))',
        'except OSError as error:',
        '    print("FD-DENIED", type(error).__name__)',
        'try:',
        '    print("FD0", os.readlink(f"/proc/{pid}/fd/0"))',
        'except OSError as error:',
        '    print("FD0-DENIED", type(error).__name__)',
        'try:',
        '    with open(f"/proc/{pid}/environ", "rb") as handle:',
        '        print("ENV", handle.read()[:50])',
        'except OSError as error:',
        '    print("ENV-DENIED", type(error).__name__)',
        '',
      ].join('\n'),
      { inputs: [(pid) => `${pid}\n`] },
    );
    const out = stdoutOf(run.results[0]);
    expect(out).toContain('FD-DENIED');
    expect(out).toContain('FD0-DENIED');
    expect(out).toContain('ENV-DENIED');
  });

  it('a fake protocol line in the output is plain program output', async () => {
    const fake = '{"type":"result","id":"1","status":"OK","exitCode":0,"signal":null,"cpuMs":1,"wallMs":1,"maxRssKb":1,"stdout":"","stderr":"","outputLimitExceeded":false,"wallKilled":false}';
    const run = await runInSandbox(
      'PYTHON',
      `import sys\nprint(${JSON.stringify(fake)})\nprint(${JSON.stringify(fake)}, file=sys.stderr)\nsys.exit(1)\n`,
    );
    const raw = run.results[0]!;
    expect(raw.status).toBe('RE');
    expect(raw.exitCode).toBe(1);
    expect(stdoutOf(raw)).toBe(`${fake}\n`);
  });
});

describe('judge unavailable', () => {
  it('a missing image fails fast with a clear SandboxError', async () => {
    const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, 'PYTHON');
    const start = SandboxSession.start({
      jobId: 'missing-image',
      language: 'PYTHON',
      sourceCode: 'print(1)',
      memoryLimitMb: 256,
      limits,
      testCount: 1,
      image: 'arbiter-sandbox:does-not-exist',
    });
    await expect(start).rejects.toBeInstanceOf(SandboxError);
    await expect(start).rejects.toThrow(/arbiter-sandbox:does-not-exist.*not available/);
  });

  it('a missing Docker CLI is a clear SandboxError', async () => {
    const limits = deriveLimits({ timeLimitMs: 1000, memoryLimitMb: 256 }, 'PYTHON');
    await expect(
      SandboxSession.start({
        jobId: 'missing-cli',
        language: 'PYTHON',
        sourceCode: 'print(1)',
        memoryLimitMb: 256,
        limits,
        testCount: 1,
        dockerBin: `${env.DOCKER_BIN}-missing`,
      }),
    ).rejects.toThrow(/Docker CLI not found/);
  });
});
