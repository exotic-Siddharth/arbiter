import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as ContestsPage } from './ContestsPage';

const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('ContestsPage clock skew', () => {
  it('evaluates the phase and countdown at server time (the Date header), not client time', async () => {
    const clientNow = Date.now();
    // The server clock is 10 minutes behind this client: for the server the contest has not
    // started, although by the client clock it began 5 minutes ago.
    const serverNow = clientNow - 10 * MINUTE;
    const contest = {
      slug: 'autumn-sprint',
      title: 'Autumn Sprint #4',
      startsAt: iso(clientNow - 5 * MINUTE),
      endsAt: iso(clientNow + 55 * MINUTE),
      status: 'UPCOMING',
      problemCount: 3,
      participantCount: 48,
      isRegistered: false,
      rated: false,
    };
    mockFetch({
      'GET /api/contests': () =>
        jsonResponse(200, [contest], { Date: new Date(serverNow).toUTCString() }),
    });
    renderWithProviders(<ContestsPage />, { route: '/contests?tab=upcoming', path: '/contests' });

    expect(await screen.findByText('Autumn Sprint #4')).toBeInTheDocument();
    expect(screen.getByText('Starts in')).toBeInTheDocument();
    expect(screen.queryByText('Ends in')).not.toBeInTheDocument();
    // About 5 minutes to the start on the server clock (not 55 minutes to the end).
    expect(screen.getByRole('timer')).toHaveTextContent(/^00:0[45]:/);
  });
});
