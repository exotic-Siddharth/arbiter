import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { closeAll } from './lib/lifecycle';
import { logger } from './lib/logger';
import { initRealtime } from './realtime/io';

/** API process: HTTP + Socket.IO. */
const app = createApp();
const server = createServer(app);
const realtime = initRealtime(server);

server.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, env: env.NODE_ENV },
    `API listening on http://localhost:${env.API_PORT}`,
  );
});

let shuttingDown = false;

/** Stop accepting connections, close sockets, then Prisma and Redis (spec section 16). */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'API shutting down');
  const force = setTimeout(() => {
    logger.error('shutdown timed out; exiting');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.closeIdleConnections();
  await realtime.close(); // also closes the HTTP server
  await closeAll();
  clearTimeout(force);
  process.exit(0);
}

// Windows never delivers SIGTERM (R14): handle SIGINT too.
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
