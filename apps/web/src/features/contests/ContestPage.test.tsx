import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as ContestPage } from './ContestPage';
import { contestDetail, demoUser } from './test/fixtures';

const HOUR = 3_600_000;

function renderContest(user = demoUser) {
  setSocketForTesting(createFakeSocket().socket);
  return renderWithProviders(<ContestPage />, {
    route: '/contests/autumn-sprint',
    path: '/contests/:slug',
    user,
  });
}

describe('ContestPage', () => {
  it('counts down with the server clock offset from serverTime', async () => {
    // The server clock runs 2 h ahead of this client; the contest starts 30 min from server now.
    const serverNow = Date.now() + 2 * HOUR;
    const startsAt = serverNow + 30 * 60_000;
    mockFetch({
      'GET /api/contests/autumn-sprint': () =>
        jsonResponse(
          200,
          contestDetail(serverNow, {
            status: 'UPCOMING',
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(startsAt + 2 * HOUR).toISOString(),
            problems: null,
          }),
        ),
    });
    renderContest();

    const timer = await screen.findByRole('timer');
    // A naive client-clock countdown would read 02:30:00.
    expect(timer.textContent).toMatch(/^00:(29:5\d|30:00)$/);
    expect(timer).toHaveAccessibleName(/until the start/);
    expect(screen.getByText('Starts in')).toBeInTheDocument();
    // Before the start: no problem tabs, only the description and the countdown.
    expect(screen.queryByRole('tab', { name: /problems/i })).not.toBeInTheDocument();
    expect(screen.getByText(/revealed when the contest starts/i)).toBeInTheDocument();
  });

  it('counts down to the end while running and lists the problems', async () => {
    const serverNow = Date.now() - 5 * 60_000; // server 5 min behind
    mockFetch({
      'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(serverNow)),
    });
    renderContest();

    const timer = await screen.findByRole('timer');
    // Ends 90 min after server now, whatever the client clock says.
    expect(timer.textContent).toMatch(/^01:(29:5\d|30:00)$/);
    expect(screen.getByText('Ends in')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'Ferry Schedule' })).toHaveAttribute(
      'href',
      '/contests/autumn-sprint/problems/B',
    );
  });

  it('shows Registered after a 409 already-registered answer', async () => {
    let registered = false;
    mockFetch({
      'GET /api/contests/autumn-sprint': () =>
        jsonResponse(200, contestDetail(Date.now(), { isRegistered: registered })),
      'POST /api/contests/autumn-sprint/register': () => {
        registered = true; // registered from another tab
        return apiError(409, 'CONFLICT', 'Already registered');
      },
    });
    renderContest();

    await userEvent.click(await screen.findByRole('button', { name: 'Register' }));
    expect(await screen.findByLabelText('You are registered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('explains a 403 after the end instead of failing silently', async () => {
    mockFetch({
      'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
      'POST /api/contests/autumn-sprint/register': () =>
        apiError(403, 'FORBIDDEN', 'Registration is closed: the contest has ended'),
    });
    renderContest();

    await userEvent.click(await screen.findByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/registration is closed/i);
  });

  it('offers guests a login link instead of the register button', async () => {
    mockFetch({
      'GET /api/contests/autumn-sprint': () => jsonResponse(200, contestDetail(Date.now())),
    });
    renderContest(null as never);

    expect(await screen.findByRole('link', { name: /log in to register/i })).toHaveAttribute(
      'href',
      '/login?next=%2Fcontests%2Fautumn-sprint',
    );
    expect(screen.queryByRole('tab', { name: /my submissions/i })).not.toBeInTheDocument();
  });
});
