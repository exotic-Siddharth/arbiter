/**
 * Process-level resource cleanup. Modules that open connections (Prisma, Redis clients, the
 * socket emitter, BullMQ queues, ...) register a closer with onShutdown(); the API and worker
 * shutdown handlers and the test teardown (test/setup.ts) call closeAll().
 */
type Closer = () => unknown;

const closers = new Map<string, Closer>();

/** Register (or replace) a named cleanup function. */
export function onShutdown(name: string, close: Closer): void {
  closers.set(name, close);
}

/** Run every registered closer (most recent first), ignoring individual failures. */
export async function closeAll(): Promise<void> {
  const pending = [...closers.values()].reverse();
  closers.clear();
  await Promise.allSettled(pending.map((close) => Promise.resolve().then(close)));
}
