import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { startHeartbeat } from '../../src/judge/heartbeat';
import { removeStaleSandboxes } from '../../src/judge/janitor';
import {
  PREFIX_LABEL,
  SANDBOX_LABEL,
  WORKER_LABEL,
  runDocker,
} from '../../src/judge/sandbox';
import { ownContainers, waitForNoContainers } from './helpers';

/** Janitor against real Docker (R17): only this prefix, only dead workers or too-old containers. */

async function startIdleContainer(name: string, prefix: string, workerId: string) {
  await runDocker(env.DOCKER_BIN, [
    'run',
    '-d',
    '--rm',
    '--pull',
    'never',
    '--name',
    name,
    '--label',
    `${SANDBOX_LABEL}=1`,
    '--label',
    `${PREFIX_LABEL}=${prefix}`,
    '--label',
    `${WORKER_LABEL}=${workerId}`,
    '--network',
    'none',
    '--entrypoint',
    'sleep',
    env.SANDBOX_IMAGE,
    '120',
  ]);
}

const otherPrefix = `${env.QUEUE_PREFIX}-other`;
const suffix = Date.now().toString(36);

afterAll(async () => {
  // Our own leftovers (if a test failed half-way) and the other-prefix container.
  const leftovers = [...(await ownContainers())];
  const other = await runDocker(env.DOCKER_BIN, [
    'ps',
    '-aq',
    '--filter',
    `label=${PREFIX_LABEL}=${otherPrefix}`,
  ]);
  leftovers.push(...other.split(/\s+/).filter(Boolean));
  if (leftovers.length > 0) await runDocker(env.DOCKER_BIN, ['rm', '-f', ...leftovers]);
  expect(await waitForNoContainers()).toEqual([]);
});

describe('removeStaleSandboxes', () => {
  it('removes containers of dead workers, keeps live workers and other prefixes', async () => {
    const heartbeat = startHeartbeat({ concurrency: 1, workerId: `alive-${suffix}` });
    await heartbeat.beat();
    try {
      await startIdleContainer(`arbiter-sbx-dead-${suffix}`, env.QUEUE_PREFIX, `dead-${suffix}`);
      await startIdleContainer(`arbiter-sbx-alive-${suffix}`, env.QUEUE_PREFIX, `alive-${suffix}`);
      await startIdleContainer(`arbiter-sbx-other-${suffix}`, otherPrefix, `dead-${suffix}`);

      const removed = await removeStaleSandboxes();
      expect(removed).toEqual([`arbiter-sbx-dead-${suffix}`]);
      const names = await runDocker(env.DOCKER_BIN, [
        'ps',
        '-a',
        '--format',
        '{{.Names}}',
        '--filter',
        `label=${SANDBOX_LABEL}=1`,
      ]);
      expect(names).toContain(`arbiter-sbx-alive-${suffix}`);
      expect(names).toContain(`arbiter-sbx-other-${suffix}`);
      expect(names).not.toContain(`arbiter-sbx-dead-${suffix}`);

      // Past the longest container lifetime (15 min) even a live worker's container is stale.
      // A day ahead, not 16 min: Docker Desktop's VM clock (container Created) was measured
      // 80 s ahead of the host clock, and it drifts.
      const later = await removeStaleSandboxes({ now: Date.now() + 24 * 60 * 60_000 });
      expect(later, `containers: ${await ownContainers()}`).toEqual([
        `arbiter-sbx-alive-${suffix}`,
      ]);
    } finally {
      await heartbeat.stop();
    }
  });
});
