import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

/** A stand-in for the socket.io client that records connect() calls and lets a test fire events. */
const fake = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    handlers,
    connect: vi.fn(),
    disconnect: vi.fn(),
    socket: {
      connected: false,
      active: false,
      on(event: string, fn: (...args: unknown[]) => void) {
        const set = handlers.get(event) ?? new Set();
        set.add(fn);
        handlers.set(event, set);
        return this;
      },
      off(event: string, fn: (...args: unknown[]) => void) {
        handlers.get(event)?.delete(fn);
        return this;
      },
      connect() {
        fake.connect();
      },
      disconnect() {
        fake.disconnect();
      },
    },
  };
});
vi.mock('socket.io-client', () => ({ io: () => fake.socket }));

// The test setup already imported the real socket module: load a fresh copy that sees the mock.
vi.resetModules();
const { getSocket, setSocketForTesting } = await import('./socket');
const { useAuth } = await import('@/stores/auth');

const fire = (event: string, ...args: unknown[]) =>
  fake.handlers.get(event)?.forEach((fn: Handler) => fn(...args));

afterEach(() => {
  setSocketForTesting(null);
  fake.handlers.clear();
  fake.connect.mockClear();
  fake.disconnect.mockClear();
});

describe('socket client reconnects after a server-side disconnect (A-07)', () => {
  it('connects again when the server closed the socket (access token expired)', async () => {
    await useAuth.getState().ready();
    getSocket();
    await Promise.resolve();
    await Promise.resolve();
    fake.connect.mockClear();

    fire('disconnect', 'io server disconnect');
    expect(fake.connect).toHaveBeenCalledTimes(1);
  });

  it('leaves transport drops to socket.io and does not reconnect after a client disconnect', async () => {
    await useAuth.getState().ready();
    getSocket();
    await Promise.resolve();
    await Promise.resolve();
    fake.connect.mockClear();

    fire('disconnect', 'transport close');
    fire('disconnect', 'io client disconnect');
    expect(fake.connect).not.toHaveBeenCalled();
  });
});
