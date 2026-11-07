// npm run wait-for -- [host:port ...] [--timeout=60]
// Waits until every TCP endpoint accepts connections (default: Postgres 55432 and Redis 56379).
import { connect } from 'node:net';

const args = process.argv.slice(2);
const timeoutArg = args.find((arg) => arg.startsWith('--timeout='));
const timeoutSec = timeoutArg ? Number(timeoutArg.split('=')[1]) : 60;
const targets = args.filter((arg) => !arg.startsWith('--'));
const endpoints = targets.length > 0 ? targets : ['localhost:55432', 'localhost:56379'];

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function waitFor(endpoint: string, deadline: number): Promise<void> {
  const separator = endpoint.lastIndexOf(':');
  const host = endpoint.slice(0, separator) || 'localhost';
  const port = Number(endpoint.slice(separator + 1));
  if (!Number.isInteger(port))
    throw new Error(`Invalid endpoint "${endpoint}" (expected host:port)`);
  while (!(await canConnect(host, port))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${endpoint}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`${endpoint} is accepting connections`);
}

const deadline = Date.now() + timeoutSec * 1000;
try {
  await Promise.all(endpoints.map((endpoint) => waitFor(endpoint, deadline)));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
