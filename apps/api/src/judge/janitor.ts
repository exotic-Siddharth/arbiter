import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { HEARTBEAT_INTERVAL_MS, heartbeatKey } from './heartbeat';
import { MAX_CONTAINER_LIFETIME_MS } from './languages';
import { PREFIX_LABEL, SANDBOX_LABEL, WORKER_LABEL, runDocker } from './sandbox';

/**
 * Removes sandbox containers left over by crashed workers (spec 8.8, R17). Only containers with
 * this deployment's arbiter.prefix label are considered, and only those whose worker heartbeat
 * is gone or that are older than the longest possible container lifetime.
 */
export async function removeStaleSandboxes(
  options: {
    prefix?: string;
    dockerBin?: string;
    redis?: Redis;
    now?: number;
    /** Wait before re-checking a missing heartbeat (default: one heartbeat interval + 1 s). */
    confirmMs?: number;
  } = {},
): Promise<string[]> {
  const prefix = options.prefix ?? env.QUEUE_PREFIX;
  const dockerBin = options.dockerBin ?? env.DOCKER_BIN;
  const redis = options.redis ?? getRedis();
  const now = options.now ?? Date.now();

  const ids = (
    await runDocker(dockerBin, [
      'ps',
      '-aq',
      '--no-trunc',
      '--filter',
      `label=${SANDBOX_LABEL}=1`,
      '--filter',
      `label=${PREFIX_LABEL}=${prefix}`,
    ])
  )
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length === 0) return [];

  const format = `{{.Id}}\t{{.Created}}\t{{index .Config.Labels "${WORKER_LABEL}"}}\t{{.Name}}`;
  const inspected = await runDocker(dockerBin, ['inspect', '--format', format, ...ids]).catch(
    // A container may vanish between ps and inspect (--rm): inspect what is left one by one.
    async () => {
      const lines = await Promise.all(
        ids.map((id) => runDocker(dockerBin, ['inspect', '--format', format, id]).catch(() => '')),
      );
      return lines.join('\n');
    },
  );

  const isAlive = async (workerId: string | undefined) =>
    workerId ? (await redis.exists(heartbeatKey(workerId))) === 1 : false;

  const stale: { id: string; name: string }[] = [];
  const orphanCandidates: { id: string; name: string; workerId: string | undefined }[] = [];
  for (const line of inspected.split('\n')) {
    const [id, created, workerId, name] = line.trim().split('\t');
    if (!id || !created) continue;
    const container = { id, name: (name ?? id).replace(/^\//, '') };
    if (now - Date.parse(created) > MAX_CONTAINER_LIFETIME_MS) stale.push(container);
    else if (!(await isAlive(workerId))) orphanCandidates.push({ ...container, workerId });
  }
  if (orphanCandidates.length > 0) {
    // A missing heartbeat is confirmed after one more heartbeat interval: a live worker
    // rewrites its key every 5 s, so a transient gap (Redis hiccup, VM clock step, a starved
    // event loop) never gets a running judge's container killed.
    const confirmMs = options.confirmMs ?? HEARTBEAT_INTERVAL_MS + 1000;
    if (confirmMs > 0) await new Promise((resolve) => setTimeout(resolve, confirmMs));
    for (const candidate of orphanCandidates) {
      if (!(await isAlive(candidate.workerId))) stale.push(candidate);
    }
  }
  if (stale.length === 0) return [];
  await runDocker(dockerBin, ['rm', '-f', ...stale.map((c) => c.id)]).catch((error: Error) => {
    logger.warn({ err: error.message }, 'janitor could not remove every container');
  });
  logger.info({ removed: stale.map((c) => c.name) }, 'janitor removed stale sandbox containers');
  return stale.map((c) => c.name);
}
