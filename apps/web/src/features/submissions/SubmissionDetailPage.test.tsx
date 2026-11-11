import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { createFakeSocket } from '@/test/fakeSocket';
import { apiError, jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { demoUser } from '@/features/problems/test/fixtures';
import { Component as SubmissionDetailPage } from './SubmissionDetailPage';
import { submissionDetail } from './test/fixtures';

vi.mock('@/lib/monaco', () => ({
  MONACO_THEMES: { dark: 'arbiter-dark', light: 'arbiter-light' },
  MonacoEditor: (props: {
    value?: string;
    language?: string;
    options?: { readOnly?: boolean; ariaLabel?: string };
  }) => (
    <textarea
      data-testid="monaco"
      data-language={props.language}
      aria-label={props.options?.ariaLabel}
      readOnly={props.options?.readOnly}
      value={props.value}
      onChange={() => {}}
    />
  ),
}));

function setup(detail: ReturnType<typeof submissionDetail> | (() => Response)) {
  const fake = createFakeSocket();
  setSocketForTesting(fake.socket);
  mockFetch({
    'GET /api/submissions/sub_lantern_1': () =>
      typeof detail === 'function' ? detail() : jsonResponse(200, detail),
  });
  renderWithProviders(<SubmissionDetailPage />, {
    route: '/submissions/sub_lantern_1',
    path: '/submissions/:id',
    user: demoUser,
  });
  return { fake };
}

// Page tests render the whole feature (lazy editor, several queries); the shared machine is slow.
describe('SubmissionDetailPage', { timeout: 20_000 }, () => {
  it('shows the summary, per-test results and the read-only source', async () => {
    setup(
      submissionDetail({
        results: [
          { ordinal: 1, verdict: 'AC', timeMs: 40, memoryKb: 9000, isSample: true },
          { ordinal: 2, verdict: 'AC', timeMs: 48, memoryKb: 9216, isSample: false },
        ],
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Lantern Relay', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);

    const table = screen.getByRole('table', { name: 'Test results' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('sample')).toBeInTheDocument();

    const source = await screen.findByTestId('monaco');
    expect(source).toHaveAttribute('readonly');
    expect(source).toHaveValue(
      'import sys\n\nprint(sum(map(int, sys.stdin.read().split()[1:])))\n',
    );
    expect(source).toHaveAttribute('data-language', 'python');
  });

  it('explains when the source is not visible', async () => {
    setup(submissionDetail({ user: { username: 'grace_h' }, sourceCode: null }));
    expect(
      await screen.findByText('Source code is visible only to its author and admins.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('monaco')).not.toBeInTheDocument();
  });

  it('follows a pending submission live', async () => {
    const { fake } = setup(
      submissionDetail({
        status: 'QUEUED',
        verdict: null,
        timeMs: null,
        memoryKb: null,
        testsPassed: 0,
        judgedAt: null,
      }),
    );
    expect((await screen.findAllByText('Queued')).length).toBeGreaterThan(0);
    act(() =>
      fake.serverEmit('submission:status', {
        id: 'sub_lantern_1',
        status: 'COMPILING',
        testsDone: 0,
        testsTotal: 12,
      }),
    );
    expect(await screen.findByRole('listitem', { current: 'step' })).toHaveTextContent('Compiling');
  });

  it('shows not found', async () => {
    setup(() => apiError(404, 'NOT_FOUND', 'Submission not found.'));
    expect(await screen.findByText('Submission not found.')).toBeInTheDocument();
  });
});
