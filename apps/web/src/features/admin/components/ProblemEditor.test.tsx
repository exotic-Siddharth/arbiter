import type { AdminProblem, AdminProblemBody } from '@arbiter/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { adminProblem, adminUser } from '../test/fixtures';
import { ExistingProblem } from './ProblemEditor';

// jsdom cannot run Monaco (R18): replace the lazily imported module with a textarea stand-in.
vi.mock('@/lib/monaco', () => ({
  MONACO_THEMES: { dark: 'arbiter-dark', light: 'arbiter-light' },
  MonacoEditor: (props: {
    value?: string;
    options?: { readOnly?: boolean; ariaLabel?: string };
    onChange?: (value: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco"
      aria-label={props.options?.ariaLabel}
      value={props.value}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}));

/** A server that stores every PUT and bumps updatedAt, as Prisma's @updatedAt does. */
function setup(normalise: (body: AdminProblemBody) => AdminProblemBody = (body) => body) {
  let stored: AdminProblem = adminProblem();
  let version = 0;
  const api = mockFetch({
    'GET /api/admin/problems/p_1': () => jsonResponse(200, stored),
    'PUT /api/admin/problems/p_1': ({ body }) => {
      version += 1;
      stored = {
        ...stored,
        ...normalise(body as AdminProblemBody),
        updatedAt: `2026-10-0${version}T10:00:00.000Z`,
      };
      return jsonResponse(200, stored);
    },
  });
  const result = renderWithProviders(
    <>
      <Link to="/elsewhere">Leave</Link>
      <ExistingProblem id="p_1" />
    </>,
    { route: '/admin/problems/p_1', user: adminUser },
  );
  return { ...result, api };
}

const statement = () => screen.getByLabelText('Statement (Markdown)', { selector: 'textarea' });

describe('problem editor tabs and unsaved changes', () => {
  it('saving the reference keeps unsaved Details edits and their dirty flag (A-R2-09)', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByRole('tab', { name: 'Details' });
    await user.clear(statement());
    await user.type(statement(), 'Half-written statement');
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    const code = await screen.findByTestId('monaco');
    await user.clear(code);
    await user.type(code, 'print(2)');
    await user.click(screen.getByRole('button', { name: 'Save reference' }));
    await waitFor(() => expect(api.requests.some((r) => r.method === 'PUT')).toBe(true));
    // The refetch carries the new updatedAt; the reference now reads as saved.
    await screen.findByText('Saved.');
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(statement()).toHaveValue('Half-written statement');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('a clean Details form re-reads the server values after its own save', async () => {
    const user = userEvent.setup();
    setup((body) => ({ ...body, title: body.title.trim() }));
    const title = await screen.findByLabelText(/^Title/);
    await user.type(title, '  ');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Lantern Rows'));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('an unsaved reference survives a tab switch and a Details save (A-R2-10)', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: 'Reference' }));
    const code = await screen.findByTestId('monaco');
    await user.clear(code);
    await user.type(code, 'print(3)');
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.type(screen.getByLabelText(/^Title/), '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    expect(screen.getByTestId('monaco')).toHaveValue('print(3)');
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();
  });

  it('asks before leaving with an unsaved reference only (A-R2-10)', async () => {
    const user = userEvent.setup();
    const { router } = setup();
    await user.click(await screen.findByRole('tab', { name: 'Reference' }));
    const code = await screen.findByTestId('monaco');
    await user.type(code, '# more');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByRole('dialog', { name: /unsaved changes/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/problems/p_1');
    // One guard for the page: exactly one dialog.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('asks before leaving with unsaved Details edits through the page guard', async () => {
    const user = userEvent.setup();
    const { router } = setup();
    await user.type(await screen.findByLabelText(/^Title/), '!');
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    expect(await screen.findByRole('dialog', { name: /unsaved changes/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/problems/p_1');
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'));
  });

  it('lets a clean editor navigate away without asking', async () => {
    const user = userEvent.setup();
    const { router } = setup();
    await screen.findByRole('tab', { name: 'Reference' });
    await user.click(screen.getByRole('link', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/elsewhere'));
  });
});
