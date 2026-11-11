import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as ProblemsPage } from './ProblemsPage';
import { demoUser, problemPage, problemSummaries, tagCounts } from './test/fixtures';

function mockProblemsApi(total = 45) {
  return mockFetch({
    'GET /api/problems': ({ query }) =>
      jsonResponse(
        200,
        problemPage(problemSummaries, {
          page: Number(query.get('page') ?? 1),
          pageSize: 20,
          total,
        }),
      ),
    'GET /api/tags': () => jsonResponse(200, tagCounts),
  });
}

const problemRequests = (api: ReturnType<typeof mockFetch>) =>
  api.requests.filter((request) => request.path === '/api/problems');

// Page tests render the whole feature (lazy editor, several queries); the shared machine is slow.
describe('ProblemsPage', { timeout: 20_000 }, () => {
  it('filters sync to the URL', async () => {
    const user = userEvent.setup();
    const api = mockProblemsApi();
    const { router } = renderWithProviders(<ProblemsPage />, {
      route: '/problems?difficulty=hard&page=2',
      user: demoUser,
    });

    // The URL drives the first request and the controls.
    await screen.findByRole('link', { name: 'Lantern Relay' });
    const first = problemRequests(api)[0];
    expect(first?.query.get('difficulty')).toBe('hard');
    expect(first?.query.get('page')).toBe('2');
    expect(screen.getByLabelText('Difficulty')).toHaveValue('hard');

    // Changing a filter writes it to the URL and resets the page.
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'easy');
    await waitFor(() => expect(router.state.location.search).toContain('difficulty=easy'));
    expect(router.state.location.search).not.toContain('page=');
    await waitFor(() => expect(problemRequests(api).at(-1)?.query.get('difficulty')).toBe('easy'));

    await user.selectOptions(screen.getByLabelText('Tag'), 'dp');
    await user.selectOptions(screen.getByLabelText('Status'), 'attempted');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'acceptance');
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('tag')).toBe('dp');
      expect(params.get('status')).toBe('attempted');
      expect(params.get('sort')).toBe('acceptance');
    });

    // Search is debounced into the URL.
    await user.type(screen.getByRole('searchbox', { name: 'Search problems' }), 'orchard');
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get('search')).toBe('orchard'),
    );
    await waitFor(() => expect(problemRequests(api).at(-1)?.query.get('search')).toBe('orchard'));

    // Paging is in the URL too.
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get('page')).toBe('2'),
    );

    // Clearing filters resets the URL.
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows acceptance, tags and solved markers', async () => {
    mockProblemsApi(3);
    renderWithProviders(<ProblemsPage />, { route: '/problems', user: demoUser });
    const row = (await screen.findByRole('link', { name: 'Lantern Relay' })).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByLabelText('Solved')).toBeInTheDocument();
    expect(cells.getByText('62%')).toBeInTheDocument();
    expect(cells.getByText('prefix-sums')).toBeInTheDocument();
    const attempted = (await screen.findByRole('link', { name: 'Orchard Partition' })).closest(
      'tr',
    ) as HTMLElement;
    expect(within(attempted).getByLabelText('Attempted')).toBeInTheDocument();
  });

  it('hides the status filter for guests', async () => {
    mockProblemsApi(3);
    renderWithProviders(<ProblemsPage />, { route: '/problems' });
    await screen.findByRole('link', { name: 'Lantern Relay' });
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('shows an empty state with a reset when nothing matches', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/problems': () => jsonResponse(200, problemPage([], { total: 0 })),
      'GET /api/tags': () => jsonResponse(200, tagCounts),
    });
    const { router } = renderWithProviders(<ProblemsPage />, {
      route: '/problems?search=zzz',
    });
    expect(await screen.findByText('No problems match these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows an error state with retry', async () => {
    mockFetch({
      'GET /api/problems': () => apiError(500, 'INTERNAL', 'Database is down.'),
      'GET /api/tags': () => jsonResponse(200, tagCounts),
    });
    renderWithProviders(<ProblemsPage />, { route: '/problems' });
    expect(await screen.findByText('Database is down.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
