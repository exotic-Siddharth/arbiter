import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { FeaturedContest } from './FeaturedContest';

const running = {
  slug: 'weekly-1',
  title: 'Weekly Round 1',
  startsAt: new Date(Date.now() - 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  status: 'RUNNING',
  problemCount: 5,
  participantCount: 42,
  isRegistered: false,
  rated: false,
};

describe('FeaturedContest (A-R2-13)', () => {
  it('keeps the loaded contest, with a refresh hint, when a background refetch fails', async () => {
    let fail = false;
    mockFetch({
      'GET /api/contests': () =>
        fail ? apiError(503, 'INTERNAL', 'Service unavailable') : jsonResponse(200, [running]),
    });
    const { queryClient } = renderWithProviders(<FeaturedContest />);
    expect(await screen.findByRole('link', { name: /weekly round 1/i })).toBeInTheDocument();

    fail = true;
    await act(() => queryClient.refetchQueries());

    expect(await screen.findByText(/could not refresh/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /weekly round 1/i })).toBeInTheDocument();
    expect(screen.queryByText('Could not load contests')).not.toBeInTheDocument();
  });

  it('shows the error when nothing was loaded', async () => {
    mockFetch({ 'GET /api/contests': () => apiError(503, 'INTERNAL', 'Service unavailable') });
    renderWithProviders(<FeaturedContest />);
    expect(await screen.findByText('Could not load contests')).toBeInTheDocument();
  });
});
