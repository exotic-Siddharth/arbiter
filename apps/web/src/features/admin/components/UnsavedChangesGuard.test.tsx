import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createBrowserRouter, createMemoryRouter, Link, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ContestForm } from './ContestForm';
import { ProblemDetailsForm } from './ProblemDetailsForm';
import { createTestQueryClient } from '@/test/render';
import { problemReference } from '../lib/problemForm';

function renderForm(onSave: () => Promise<void> = () => Promise.resolve()) {
  const router = createMemoryRouter(
    [
      {
        path: '/edit',
        element: (
          <>
            <Link to="/elsewhere">Leave</Link>
            <ProblemDetailsForm reference={problemReference(undefined)} isNew onSave={onSave} />
          </>
        ),
      },
      { path: '/elsewhere', element: <p>Elsewhere</p> },
    ],
    { initialEntries: ['/edit'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('unsaved-changes guard on the admin forms', () => {
  it('asks before leaving a dirty form, and Stay keeps the edits', async () => {
    const user = userEvent.setup();
    const router = renderForm();
    await user.type(screen.getByLabelText(/^Title/), 'Half-written');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByRole('dialog', { name: /unsaved changes/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/edit');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Half-written');
    expect(router.state.location.pathname).toBe('/edit');
  });

  it('Discard leaves the page', async () => {
    const user = userEvent.setup();
    const router = renderForm();
    await user.type(screen.getByLabelText(/^Title/), 'x');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'));
  });

  it('does not interfere when the form is clean', async () => {
    const user = userEvent.setup();
    const router = renderForm();
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'));
  });

  it('warns on reload/close only while dirty', async () => {
    const user = userEvent.setup();
    renderForm();
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);
    await user.type(screen.getByLabelText(/^Title/), 'x');
    expect(fire()).toBe(true);
  });

  it('lets a save navigate away (create then redirect) without prompting', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/new',
          element: (
            <ProblemDetailsForm
              reference={problemReference(undefined)}
              isNew
              onSave={async () => {
                await router.navigate('/created', { replace: true });
              }}
            />
          ),
        },
        { path: '/created', element: <p>Created</p> },
      ],
      { initialEntries: ['/new'] },
    );
    render(<RouterProvider router={router} />);
    await user.type(screen.getByLabelText(/^Title/), 'Sum');
    await user.type(screen.getByLabelText(/^Slug/), 'sum');
    await user.type(
      screen.getByLabelText('Statement (Markdown)', { selector: 'textarea' }),
      'Add numbers.',
    );
    await user.click(screen.getByRole('button', { name: 'Create problem' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/created'));
  });

  // Browser history traverses asynchronously (popstate arrives later), unlike memory history:
  // a reset() after proceed() would re-block the re-sent Back and reopen the dialog for ever.
  describe('with real (async) browser history', () => {
    function renderBrowser() {
      window.history.replaceState(null, '', '/elsewhere');
      const router = createBrowserRouter([
        {
          path: '/edit',
          element: (
            <>
              <Link to="/elsewhere">Leave</Link>
              <ProblemDetailsForm
                reference={problemReference(undefined)}
                isNew
                onSave={() => Promise.resolve()}
              />
            </>
          ),
        },
        { path: '/elsewhere', element: <p>Elsewhere</p> },
      ]);
      render(<RouterProvider router={router} />);
      return router;
    }

    it('browser Back then Discard leaves the page', async () => {
      const user = userEvent.setup();
      const router = renderBrowser();
      await act(() => router.navigate('/edit'));
      await user.type(await screen.findByLabelText(/^Title/), 'x');
      act(() => window.history.back());
      await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
      expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
      // Let any re-sent traversal settle: the dialog must not come back.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(router.state.location.pathname).toBe('/elsewhere');
      expect(window.location.pathname).toBe('/elsewhere');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      router.dispose();
    });

    it('a link click then Discard leaves the page', async () => {
      const user = userEvent.setup();
      const router = renderBrowser();
      await act(() => router.navigate('/edit'));
      await user.type(await screen.findByLabelText(/^Title/), 'x');
      await user.click(screen.getByRole('link', { name: 'Leave' }));
      await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
      expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/elsewhere');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      router.dispose();
    });
  });

  it('guards the contest form too', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/c',
          element: (
            <>
              <Link to="/elsewhere">Leave</Link>
              <ContestForm isNew onSave={vi.fn()} />
            </>
          ),
        },
        { path: '/elsewhere', element: <p>Elsewhere</p> },
      ],
      { initialEntries: ['/c'] },
    );
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await user.type(screen.getByLabelText(/^Title/), 'Cup');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByRole('dialog', { name: /unsaved changes/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c');
  });
});
