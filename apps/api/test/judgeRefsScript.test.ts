import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../../../scripts/judge-refs.ts');

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

function run(api: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', SCRIPT, `--api=${api}`, '--only=assembly-order', '--timeout=3'],
      { cwd: resolve(import.meta.dirname, '../../..'), env: { ...process.env } },
    );
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('close', (code) => done({ code, out }));
  });
}

describe('scripts/judge-refs.ts (A-52)', () => {
  it('logs in again when the access token expires and fails fast on an unexpected status', async () => {
    let logins = 0;
    const polledWith: (string | undefined)[] = [];
    const body = (req: IncomingMessage) =>
      new Promise<void>((done) => {
        req.resume();
        req.on('end', done);
      });
    server = createServer((req, res) => {
      void body(req).then(() => {
        res.setHeader('Content-Type', 'application/json');
        const url = req.url ?? '';
        if (url.endsWith('/auth/login')) {
          logins += 1;
          res.end(JSON.stringify({ accessToken: `token-${logins}` }));
        } else if (req.method === 'POST' && url.endsWith('/submissions')) {
          res.statusCode = 202;
          res.end(JSON.stringify({ submission: { id: 'sub-1' } }));
        } else if (url.includes('/submissions/')) {
          const auth = req.headers.authorization;
          polledWith.push(auth);
          // token-1 has "expired"; the refreshed token meets a server error
          res.statusCode = auth === 'Bearer token-1' ? 401 : 500;
          res.end(JSON.stringify({ error: { message: 'nope' } }));
        } else {
          res.statusCode = 404;
          res.end('{}');
        }
      });
    });
    await new Promise<void>((ok) => server?.listen(0, '127.0.0.1', ok));
    const api = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;

    const { code, out } = await run(api);

    expect(logins).toBeGreaterThanOrEqual(2);
    expect(polledWith).toContain('Bearer token-2');
    expect(out).toContain('answered 500');
    expect(out).not.toContain('no verdict');
    expect(code).toBe(1);
  }, 60_000);
});
