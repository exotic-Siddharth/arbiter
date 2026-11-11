import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { useAuth } from '@/stores/auth';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { createTestQueryClient } from '@/test/render';
import { submissionDetail } from '@/features/submissions/test/fixtures';
import { demoUser } from '../test/fixtures';
import { useSubmissionProgress } from './useSubmissionProgress';

function setup() {
  const fake = createFakeSocket();
  setSocketForTesting(fake.socket);
  useAuth.setState({ status: 'authenticated', user: demoUser, accessToken: 'test-token' });
  const queued = submissionDetail({
    id: 'sub_1',
    status: 'QUEUED',
    verdict: null,
    timeMs: null,
    memoryKb: null,
    testsPassed: 0,
    testsTotal: 3,
    judgedAt: null,
  });
  const api = mockFetch({
    'GET /api/submissions/sub_1': () => jsonResponse(200, queued),
  });
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const hook = renderHook(() => useSubmissionProgress('sub_1'), { wrapper });
  return { fake, api, hook };
}

describe('useSubmissionProgress', () => {
  it('applies status/test/done events in order and ignores other ids', async () => {
    const { fake, hook } = setup();
    await waitFor(() => expect(hook.result.current.progress?.status).toBe('QUEUED'));
    expect(fake.emitted).toContainEqual({ event: 'submission:subscribe', args: [{ id: 'sub_1' }] });

    // Another submission's events never leak into this one.
    act(() => {
      fake.serverEmit('submission:status', {
        id: 'sub_other',
        status: 'RUNNING',
        testsDone: 2,
        testsTotal: 9,
      });
      fake.serverEmit('submission:test', {
        id: 'sub_other',
        ordinal: 1,
        verdict: 'WA',
        timeMs: 5,
        memoryKb: 100,
        isSample: true,
      });
    });
    expect(hook.result.current.progress).toMatchObject({ status: 'QUEUED', testsDone: 0 });
    expect(hook.result.current.progress?.tests).toHaveLength(0);

    act(() =>
      fake.serverEmit('submission:status', {
        id: 'sub_1',
        status: 'COMPILING',
        testsDone: 0,
        testsTotal: 3,
      }),
    );
    expect(hook.result.current.progress?.status).toBe('COMPILING');

    act(() => {
      fake.serverEmit('submission:status', {
        id: 'sub_1',
        status: 'RUNNING',
        testsDone: 0,
        testsTotal: 3,
      });
      fake.serverEmit('submission:test', {
        id: 'sub_1',
        ordinal: 1,
        verdict: 'AC',
        timeMs: 12,
        memoryKb: 9000,
        isSample: true,
      });
      fake.serverEmit('submission:test', {
        id: 'sub_1',
        ordinal: 2,
        verdict: 'WA',
        timeMs: 14,
        memoryKb: 9100,
        isSample: true,
      });
    });
    expect(hook.result.current.progress).toMatchObject({
      status: 'RUNNING',
      testsDone: 2,
      testsTotal: 3,
      testsPassed: 1,
    });
    expect(hook.result.current.progress?.tests.map((test) => test.verdict)).toEqual(['AC', 'WA']);

    act(() =>
      fake.serverEmit('submission:done', {
        id: 'sub_1',
        status: 'DONE',
        verdict: 'WA',
        timeMs: 14,
        memoryKb: 9100,
        testsPassed: 1,
        testsTotal: 3,
      }),
    );
    expect(hook.result.current.progress).toMatchObject({
      status: 'DONE',
      verdict: 'WA',
      timeMs: 14,
      testsPassed: 1,
    });
    expect(hook.result.current.isPending).toBe(false);

    // A late status event (out of order) cannot move a finished submission backwards.
    act(() =>
      fake.serverEmit('submission:status', {
        id: 'sub_1',
        status: 'RUNNING',
        testsDone: 1,
        testsTotal: 3,
      }),
    );
    expect(hook.result.current.progress?.status).toBe('DONE');
  });

  it('re-joins the room on reconnect and refetches the REST snapshot', async () => {
    const { fake, api, hook } = setup();
    await waitFor(() => expect(hook.result.current.progress?.status).toBe('QUEUED'));
    const fetchesBefore = api.requests.filter((r) => r.path === '/api/submissions/sub_1').length;

    act(() => fake.reconnect());

    const joins = fake.emitted.filter((e) => e.event === 'submission:subscribe');
    expect(joins.length).toBeGreaterThanOrEqual(2);
    await waitFor(() =>
      expect(
        api.requests.filter((r) => r.path === '/api/submissions/sub_1').length,
      ).toBeGreaterThan(fetchesBefore),
    );
  });
});
