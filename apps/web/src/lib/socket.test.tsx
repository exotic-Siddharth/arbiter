import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeSocket } from '@/test/fakeSocket';
import { createTestQueryClient } from '@/test/render';
import { setSocketForTesting, useRoom, useSocketEvent } from './socket';

function wrapperWith(client = createTestQueryClient()) {
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

function Room({ slug }: { slug: string | null }) {
  useRoom('contest:subscribe', slug ? { slug } : null, {
    invalidate: [['contests', 'scoreboard', slug ?? '']],
  });
  return null;
}

describe('useRoom (R6)', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const { wrapper } = wrapperWith();
    const { unmount } = render(<Room slug="weekly" />, { wrapper });
    expect(fake.emitted).toEqual([{ event: 'contest:subscribe', args: [{ slug: 'weekly' }] }]);
    unmount();
    expect(fake.emitted.at(-1)).toEqual({ event: 'contest:unsubscribe', args: [{ slug: 'weekly' }] });
  });

  it('re-subscribes on every reconnect and invalidates the given queries', () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const { wrapper, client } = wrapperWith();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<Room slug="weekly" />, { wrapper });
    expect(invalidate).toHaveBeenCalledTimes(1); // after the first join

    act(() => fake.reconnect());
    act(() => fake.reconnect());

    const subscribes = fake.emitted.filter((entry) => entry.event === 'contest:subscribe');
    expect(subscribes).toHaveLength(3);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['contests', 'scoreboard', 'weekly'] });
  });

  it('waits for the connection when the socket is offline', () => {
    const fake = createFakeSocket({ connected: false });
    setSocketForTesting(fake.socket);
    const { wrapper } = wrapperWith();
    render(<Room slug="weekly" />, { wrapper });
    expect(fake.emitted).toEqual([]);
    act(() => fake.connect());
    expect(fake.emitted).toEqual([{ event: 'contest:subscribe', args: [{ slug: 'weekly' }] }]);
  });

  it('does nothing while the payload is null and switches rooms when it changes', () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const { wrapper } = wrapperWith();
    const { rerender } = render(<Room slug={null} />, { wrapper });
    expect(fake.emitted).toEqual([]);
    rerender(<Room slug="a" />);
    rerender(<Room slug="b" />);
    expect(fake.emitted.map((entry) => `${entry.event}:${JSON.stringify(entry.args)}`)).toEqual([
      'contest:subscribe:[{"slug":"a"}]',
      'contest:unsubscribe:[{"slug":"a"}]',
      'contest:subscribe:[{"slug":"b"}]',
    ]);
  });

  it('does not invalidate when the server refuses the subscription', () => {
    const fake = createFakeSocket();
    fake.setAck({ ok: false, error: 'FORBIDDEN' });
    setSocketForTesting(fake.socket);
    const { wrapper, client } = wrapperWith();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<Room slug="weekly" />, { wrapper });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('joins the feed room without a payload', () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const { wrapper } = wrapperWith();
    function Feed() {
      useRoom('feed:subscribe', {});
      return null;
    }
    const { unmount } = render(<Feed />, { wrapper });
    unmount();
    expect(fake.emitted).toEqual([
      { event: 'feed:subscribe', args: [] },
      { event: 'feed:unsubscribe', args: [] },
    ]);
  });
});

describe('useSocketEvent', () => {
  it('delivers valid payloads to the latest handler and drops invalid ones', () => {
    const fake = createFakeSocket();
    setSocketForTesting(fake.socket);
    const seen: string[] = [];
    function Listener({ prefix }: { prefix: string }) {
      useSocketEvent('submission:status', (event) => seen.push(`${prefix}:${event.id}:${event.status}`));
      return null;
    }
    const { wrapper } = wrapperWith();
    const { rerender } = render(<Listener prefix="one" />, { wrapper });
    act(() => fake.serverEmit('submission:status', { id: 's1', status: 'RUNNING', testsDone: 1, testsTotal: 5 }));
    rerender(<Listener prefix="two" />);
    act(() => fake.serverEmit('submission:status', { id: 's1', status: 'DONE', testsDone: 5, testsTotal: 5 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() =>
      fake.serverEmit('submission:status', { id: 's1', status: 'BOGUS' } as unknown as Parameters<
        typeof fake.serverEmit<'submission:status'>
      >[1]),
    );
    expect(seen).toEqual(['one:s1:RUNNING', 'two:s1:DONE']);
  });
});
