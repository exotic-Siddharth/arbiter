import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as AdminContestsPage } from './AdminContestsPage';
import { adminUser } from './test/fixtures';

const summary = (id: string, title: string, ratedAt: string | null) => ({
  id,
  slug: id,
  title,
  startsAt: '2026-10-01T10:00:00.000Z',
  endsAt: '2026-10-01T12:00:00.000Z',
  status: 'ENDED',
  isPublished: true,
  problemCount: 3,
  participantCount: 10,
  ratedAt,
});

describe('AdminContestsPage', () => {
  it('cannot delete a rated contest, the API answers 409 (A-18)', async () => {
    mockFetch({
      'GET /api/admin/contests': () =>
        jsonResponse(200, {
          items: [
            summary('rated', 'Rated Cup', '2026-10-02T10:00:00.000Z'),
            summary('open', 'Open Cup', null),
          ],
          total: 2,
          page: 1,
          pageSize: 20,
        }),
    });
    renderWithProviders(<AdminContestsPage />, { route: '/admin/contests', user: adminUser });
    expect(await screen.findByRole('button', { name: 'Delete Open Cup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Rated Cup' })).toBeDisabled();
  });
});
