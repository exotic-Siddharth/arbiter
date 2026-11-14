import { describe, expect, it } from 'vitest';
import { dockerRunArgs } from './sandbox';

const args = (runtime?: string) =>
  dockerRunArgs({
    name: 'arbiter-sbx-test',
    image: 'arbiter-sandbox:latest',
    prefix: 'arbiter',
    workerId: 'w1',
    containerMemoryMb: 512,
    runtime,
  });

/** The value following `flag` in the argument list (undefined when the flag is absent). */
const valueOf = (list: string[], flag: string) => {
  const index = list.indexOf(flag);
  return index === -1 ? undefined : list[index + 1];
};

describe('dockerRunArgs', () => {
  it('sets the memory limit with no swap, and the resource and privilege limits', () => {
    const list = args();
    expect(valueOf(list, '--memory')).toBe('512m');
    expect(valueOf(list, '--memory-swap')).toBe('512m');
    expect(valueOf(list, '--network')).toBe('none');
    expect(valueOf(list, '--pids-limit')).toBe('128');
    expect(valueOf(list, '--cap-drop')).toBe('ALL');
    expect(list).toContain('--read-only');
  });

  it('makes a sandbox the host OOM killer’s first choice (--oom-score-adj 500)', () => {
    expect(valueOf(args(), '--oom-score-adj')).toBe('500');
  });

  it('adds --runtime only when one is configured, and ends with the image', () => {
    expect(args()).not.toContain('--runtime');
    const list = args('runsc');
    expect(valueOf(list, '--runtime')).toBe('runsc');
    expect(list.at(-1)).toBe('arbiter-sandbox:latest');
  });
});
