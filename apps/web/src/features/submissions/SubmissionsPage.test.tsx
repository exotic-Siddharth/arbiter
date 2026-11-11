import type { Me } from '@arbiter/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { demoUser, problemPage, problemSummaries } from '@/features/problems/test/fixtures';
import { Component as SubmissionsPage } from './SubmissionsPage';
import { submissionPage, submissionSummary } from './test/fixtures';

const pendingOwn = submissionSummary({
  id: 'sub_pending',
  status: 'RUNNING',
  verdict: null,
  timeMs: null,
  memoryKb: null,
  testsPassed: 0,
  testsTotal: 12,
  judgedAt: null,
});
const judgedOther = submissionSummary({
  id: 'sub_other',
  user: { username: 'grace_h' },
  problem: { slug: 'signal-towers', title: 'Signal Towers' },
  language: 'CPP',
  verdict: 'TLE',
  timeMs: 2000,
});

function setup(route = '/submissions', user: Me | null = demoUser) {
  const fake = createFakeSocket();
  setSocketForTesting(fake.socket);
  let calls = 0;
  const api = mockFetch({
    'GET /api/submissions': () => {
      calls += 1;
      // After the done event the REST list has the verdict too.
      const first =
        calls === 1
          ? pendingOwn
          : { ...pendingOwn, status: 'DONE' as const, verdict: 'AC' as const };
      return jsonResponse(200, submissionPage([first, judgedOther], { total: 2 }));
    },
    'GET /api/problems': () => jsonResponse(200, problemPage(problemSummaries)),
  });
  const result = renderWithProviders(<SubmissionsPage />, { route, user });
  return { ...result, api, fake };
}

const listRequests = (api: ReturnType<typeof mockFetch>) =>
  api.requests.filter((request) => request.path === '/api/submissions');

// Page tests render the whole feature (lazy editor, several queries); the shared machine is slow.
describe('SubmissionsPage', { timeout: 20_000 }, () => {
  it('filters sync to the URL and the request', async () => {
    const user = userEvent.setup();
    const { api, router } = setup('/submissions?verdict=TLE');
    await screen.findByRole('link', { name: 'Signal Towers' });
    expect(listRequests(api)[0]?.query.get('verdict')).toBe('TLE');
    expect(screen.getByLabelText('Verdict')).toHaveValue('TLE');

    await user.click(screen.getByRole('tab', { name: 'Mine' }));
    await waitFor(() => expect(router.state.location.search).toContain('mine=true'));
    await waitFor(() => expect(listRequests(api).at(-1)?.query.get('mine')).toBe('true'));

    await user.selectOptions(screen.getByLabelText('Language'), 'CPP');
    await user.selectOptions(await screen.findByLabelText('Problem'), 'signal-towers');
    await waitFor(() => {
      const query = listRequests(api).at(-1)?.query;
      expect(query?.get('language')).toBe('CPP');
      expect(query?.get('problemSlug')).toBe('signal-towers');
    });
  });

  it('updates own pending rows live from socket events', async () => {
    const { fake } = setup();
    const row = (await screen.findByRole('link', { name: 'Lantern Relay' })).closest(
      'tr',
    ) as HTMLElement;
    await waitFor(() =>
      expect(fake.emitted).toContainEqual({
        event: 'submission:subscribe',
        args: [{ id: 'sub_pending' }],
      }),
    );
    // Someone else's finished row gets no room subscription.
    expect(fake.emitted).not.toContainEqual({
      event: 'submission:subscribe',
      args: [{ id: 'sub_other' }],
    });

    act(() =>
      fake.serverEmit('submission:status', {
        id: 'sub_pending',
        status: 'RUNNING',
        testsDone: 5,
        testsTotal: 12,
      }),
    );
    expect(await within(row).findByText('Running 5/12')).toBeInTheDocument();

    act(() =>
      fake.serverEmit('submission:done', {
        id: 'sub_pending',
        status: 'DONE',
        verdict: 'AC',
        timeMs: 41,
        memoryKb: 9300,
        testsPassed: 12,
        testsTotal: 12,
      }),
    );
    const updated = (await screen.findByRole('link', { name: 'Lantern Relay' })).closest(
      'tr',
    ) as HTMLElement;
    expect(await within(updated).findByText('Accepted')).toBeInTheDocument();
  });

  it('hides the mine filter for guests', async () => {
    setup('/submissions', null);
    await screen.findByRole('link', { name: 'Signal Towers' });
    expect(screen.queryByRole('tab', { name: 'Mine' })).not.toBeInTheDocument();
  });
});
