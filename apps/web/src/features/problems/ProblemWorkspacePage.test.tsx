import { LANGUAGES } from '@arbiter/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { createFakeSocket } from '@/test/fakeSocket';
import { jsonResponse, mockFetch, type MockHandler } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import {
  submissionDetail,
  submissionPage,
  submissionSummary,
} from '@/features/submissions/test/fixtures';
import { draftKey } from './hooks/useDraft';
import { Component as ProblemWorkspacePage } from './ProblemWorkspacePage';
import { contestDetail, demoUser, problemDetail } from './test/fixtures';

// jsdom cannot run Monaco (R18): replace the lazily imported module with a textarea stand-in.
vi.mock('@/lib/monaco', () => ({
  MONACO_THEMES: { dark: 'arbiter-dark', light: 'arbiter-light' },
  MonacoEditor: (props: {
    value?: string;
    language?: string;
    options?: { readOnly?: boolean; ariaLabel?: string };
    onChange?: (value: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco"
      data-language={props.language}
      aria-label={props.options?.ariaLabel}
      readOnly={props.options?.readOnly}
      value={props.value}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}));

const problem = problemDetail();

function setup(routes: Record<string, MockHandler> = {}, route = '/problems/lantern-relay') {
  const fake = createFakeSocket();
  setSocketForTesting(fake.socket);
  const api = mockFetch({
    'GET /api/problems/lantern-relay': () => jsonResponse(200, problem),
    'GET /api/submissions': () => jsonResponse(200, submissionPage([])),
    ...routes,
  });
  const result = renderWithProviders(<ProblemWorkspacePage />, {
    route,
    path: route.startsWith('/contests') ? '/contests/:slug/problems/:label' : '/problems/:slug',
    user: demoUser,
  });
  return { ...result, api, fake };
}

async function editor() {
  return screen.findByTestId('monaco');
}

// Page tests render the whole feature (lazy editor, several queries); the shared machine is slow.
describe('ProblemWorkspacePage', { timeout: 20_000 }, () => {
  it('renders the statement, limits and samples', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Lantern Relay' })).toBeInTheDocument();
    expect(screen.getByText('1 s')).toBeInTheDocument();
    expect(screen.getByText('256 MB')).toBeInTheDocument();
    const sample = screen.getByRole('region', { name: 'Sample 1' });
    expect(within(sample).getByRole('button', { name: 'Copy sample 1 input' })).toBeInTheDocument();
    // The custom input starts as sample 1.
    expect(screen.getByLabelText('Custom input')).toHaveValue('5\n3 1 4 1 5\n');
  });

  it('keeps a draft per problem and language', async () => {
    const user = userEvent.setup();
    setup();
    const box = await editor();
    expect(box).toHaveValue(LANGUAGES.CPP.template);

    fireEvent.change(box, { target: { value: 'int main() { return 0; }' } });
    expect(window.localStorage.getItem(draftKey('lantern-relay', 'CPP'))).toBe(
      'int main() { return 0; }',
    );

    await user.selectOptions(screen.getByLabelText('Language'), 'PYTHON');
    expect(await editor()).toHaveValue(LANGUAGES.PYTHON.template);
    await user.selectOptions(screen.getByLabelText('Language'), 'CPP');
    expect(await editor()).toHaveValue('int main() { return 0; }');
  });

  it('shows a toast with the wait when submissions are rate limited (429)', async () => {
    const user = userEvent.setup();
    const errorToast = vi.spyOn(toast, 'error');
    setup({
      'POST /api/submissions': () =>
        jsonResponse(
          429,
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many submissions.',
              details: { retryAfterSec: 37 },
            },
          },
          { 'Retry-After': '37' },
        ),
    });
    await editor();
    await user.click(screen.getByRole('button', { name: /^Submit/ }));
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Slow down', {
        description: 'Too many submissions. Try again in 37 s.',
      }),
    );
  });

  it('submits with Ctrl+Enter and shows live progress in the Result tab', async () => {
    const created = submissionSummary({
      id: 'sub_new',
      status: 'QUEUED',
      verdict: null,
      timeMs: null,
      memoryKb: null,
      testsPassed: 0,
      testsTotal: 12,
      judgedAt: null,
    });
    const { api, fake } = setup({
      'POST /api/submissions': () => jsonResponse(202, { submission: created }),
      'GET /api/submissions/sub_new': () =>
        jsonResponse(200, submissionDetail({ ...created, results: [] })),
    });
    await editor();
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });

    await waitFor(() =>
      expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({
        problemSlug: 'lantern-relay',
        language: 'CPP',
        sourceCode: LANGUAGES.CPP.template,
      }),
    );
    expect(await screen.findByText('Queued')).toBeInTheDocument();
    await waitFor(() =>
      expect(fake.emitted).toContainEqual({
        event: 'submission:subscribe',
        args: [{ id: 'sub_new' }],
      }),
    );

    act(() => {
      fake.serverEmit('submission:status', {
        id: 'sub_new',
        status: 'RUNNING',
        testsDone: 0,
        testsTotal: 12,
      });
      fake.serverEmit('submission:test', {
        id: 'sub_new',
        ordinal: 1,
        verdict: 'AC',
        timeMs: 4,
        memoryKb: 3000,
        isSample: true,
      });
    });
    expect(await screen.findByText('Running 1/12')).toBeInTheDocument();
  });

  it('runs on the custom input with the problem slug (R11)', async () => {
    const user = userEvent.setup();
    const { api, fake } = setup({
      'POST /api/runs': () => jsonResponse(202, { runId: 'run_1' }),
      'GET /api/runs/run_1': () => jsonResponse(200, { status: 'PENDING' }),
    });
    await editor();
    await user.click(screen.getByRole('button', { name: /^Run/ }));
    await waitFor(() =>
      expect(api.requests.find((r) => r.path === '/api/runs')?.body).toEqual({
        language: 'CPP',
        sourceCode: LANGUAGES.CPP.template,
        input: '5\n3 1 4 1 5\n',
        problemSlug: 'lantern-relay',
      }),
    );
    await waitFor(() => expect(api.requests.some((r) => r.path === '/api/runs/run_1')).toBe(true));

    act(() =>
      fake.serverEmit('run:result', {
        runId: 'run_1',
        status: 'OK',
        stdout: '14\n',
        stderr: '',
        compileOutput: null,
        timeMs: 9,
        memoryKb: 4000,
      }),
    );
    expect(await screen.findByText('Matches the expected output of sample 1')).toBeInTheDocument();
  });

  it('contest mode shows the contest header and submits with contestSlug', async () => {
    const user = userEvent.setup();
    const contest = contestDetail();
    const { api } = setup(
      {
        'GET /api/contests/weekly-practice-arena': () => jsonResponse(200, contest),
        'GET /api/contests/weekly-practice-arena/problems/B': () =>
          jsonResponse(
            200,
            problemDetail({
              slug: 'orchard-partition',
              title: 'Orchard Partition',
              contest: { slug: contest.slug, label: 'B' },
            }),
          ),
        'POST /api/submissions': () =>
          jsonResponse(202, {
            submission: submissionSummary({ id: 'sub_c', status: 'QUEUED', verdict: null }),
          }),
        'GET /api/submissions/sub_c': () =>
          jsonResponse(200, submissionDetail({ id: 'sub_c', status: 'QUEUED', verdict: null })),
      },
      '/contests/weekly-practice-arena/problems/B',
    );

    expect(await screen.findByRole('link', { name: 'Weekly Practice Arena' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    const switcher = screen.getByRole('navigation', { name: 'Contest problems' });
    expect(within(switcher).getByRole('link', { name: /^Problem B/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await editor();
    await user.click(screen.getByRole('button', { name: /^Submit/ }));
    await waitFor(() =>
      expect(api.requests.find((r) => r.method === 'POST')?.body).toMatchObject({
        problemSlug: 'orchard-partition',
        contestSlug: 'weekly-practice-arena',
      }),
    );
  });

  it('blocks submitting to a running contest the user has not registered for', async () => {
    setup(
      {
        'GET /api/contests/weekly-practice-arena': () =>
          jsonResponse(200, contestDetail({ isRegistered: false })),
        'GET /api/contests/weekly-practice-arena/problems/A': () =>
          jsonResponse(
            200,
            problemDetail({ contest: { slug: 'weekly-practice-arena', label: 'A' } }),
          ),
      },
      '/contests/weekly-practice-arena/problems/A',
    );
    expect(await screen.findByText(/Register for the contest to submit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Submit/ })).toBeDisabled();
  });
});
