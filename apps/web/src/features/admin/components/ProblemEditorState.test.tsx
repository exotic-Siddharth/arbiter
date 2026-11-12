import type { AdminProblem, AdminProblemBody, AdminTestCaseSummary } from '@arbiter/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { qk } from '@/lib/queryKeys';
import { jsonResponse, mockFetch } from '@/test/fetchMock';
import { renderWithProviders } from '@/test/render';
import { Component as AdminProblemEditorPage } from '../AdminProblemEditorPage';
import { adminProblem, adminUser } from '../test/fixtures';

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

// Every started validation finishes at once with AC (the socket stream is not under test here).
vi.mock('../hooks/useValidationRun', () => ({
  useValidationRun: (submissionId: string | null) => ({
    run: submissionId
      ? {
          status: 'DONE',
          verdict: 'AC',
          testsDone: 2,
          testsTotal: 2,
          testsPassed: 2,
          timeMs: 12,
          memoryKb: 2048,
          tests: [],
          compileOutput: null,
          errorMessage: null,
          finished: true,
        }
      : null,
    isLoading: false,
    error: null,
  }),
}));

function testSummary(ordinal: number): AdminTestCaseSummary {
  return {
    id: `t_${ordinal}`,
    ordinal,
    isSample: ordinal === 1,
    explanation: null,
    inputBytes: 4,
    expectedOutputBytes: 2,
    inputPreview: `${ordinal} 2`,
    expectedOutputPreview: '3',
  };
}

/** A server holding problems by id; every PUT stores the body and bumps updatedAt. */
function setup(problems: AdminProblem[], route: string, options: { testsDelayMs?: number } = {}) {
  const stored = new Map(problems.map((problem) => [problem.id, problem]));
  const tests = new Map(problems.map((problem) => [problem.id, [testSummary(1), testSummary(2)]]));
  let version = 0;
  const routes: Parameters<typeof mockFetch>[0] = {};
  for (const id of stored.keys()) {
    routes[`GET /api/admin/problems/${id}`] = () => jsonResponse(200, stored.get(id));
    routes[`GET /api/admin/problems/${id}/tests`] = async () => {
      if (options.testsDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.testsDelayMs));
      }
      return jsonResponse(200, tests.get(id));
    };
    routes[`POST /api/admin/problems/${id}/generate-outputs`] = () =>
      jsonResponse(202, { jobId: `j_${id}` });
    routes[`GET /api/admin/jobs/j_${id}`] = () =>
      jsonResponse(200, {
        id: `j_${id}`,
        type: 'GENERATE_OUTPUTS',
        status: 'DONE',
        progress: 2,
        total: 2,
        error: null,
      });
    routes[`PUT /api/admin/problems/${id}`] = ({ body }) => {
      version += 1;
      const next = {
        ...stored.get(id)!,
        ...(body as AdminProblemBody),
        updatedAt: `2026-10-0${version}T10:00:00.000Z`,
      };
      stored.set(id, next);
      return jsonResponse(200, next);
    };
    routes[`POST /api/admin/problems/${id}/validate-reference`] = () =>
      jsonResponse(202, { submissionId: `s_${id}` });
  }
  const api = mockFetch(routes);
  const result = renderWithProviders(<AdminProblemEditorPage />, {
    route,
    path: '/admin/problems/:id',
    user: adminUser,
  });
  const refetch = () =>
    act(async () => {
      await result.queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
    });
  return { ...result, api, stored, tests, refetch };
}

const code = () => screen.getByTestId('monaco');
const ACCEPTED = 'The reference solution is accepted';
const NOT_VALIDATED = 'Not validated in this session.';

async function validate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Validate' }));
  expect(await screen.findByText(ACCEPTED)).toBeInTheDocument();
}

describe('Reference verdict is tied to what it judged (A-R3-03)', () => {
  it('an accepted verdict disappears after a new reference is saved', async () => {
    const user = userEvent.setup();
    setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    await validate(user);
    await user.clear(code());
    await user.type(code(), 'print(2)');
    await user.click(screen.getByRole('button', { name: 'Save reference' }));
    await screen.findByText('Saved.');
    expect(screen.queryByText(ACCEPTED)).not.toBeInTheDocument();
    expect(screen.getByText(NOT_VALIDATED)).toBeInTheDocument();
  });

  it('an accepted verdict disappears after the limits change on Details', async () => {
    const user = userEvent.setup();
    setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    await validate(user);
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const limit = screen.getByLabelText(/^Time limit/);
    await user.clear(limit);
    await user.type(limit, '100');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    expect(screen.queryByText(ACCEPTED)).not.toBeInTheDocument();
    expect(screen.getByText(NOT_VALIDATED)).toBeInTheDocument();
  });

  it('an accepted verdict disappears after the test set changes', async () => {
    const user = userEvent.setup();
    const { stored, tests, refetch } = setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    await validate(user);
    tests.set('p_1', [testSummary(1), testSummary(2), testSummary(3)]);
    stored.set('p_1', { ...stored.get('p_1')!, testCount: 3 });
    await refetch();
    await waitFor(() => expect(screen.queryByText(ACCEPTED)).not.toBeInTheDocument());
    expect(screen.getByText(NOT_VALIDATED)).toBeInTheDocument();
  });

  it('the verdict stays across a save that changes nothing it judged (the title)', async () => {
    const user = userEvent.setup();
    setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    await validate(user);
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.type(screen.getByLabelText(/^Title/), '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    expect(screen.getByText(ACCEPTED)).toBeInTheDocument();
  });
});

// The verdict keys include the test list, so a run started before it loads would be tagged with a
// key that changes as soon as the list arrives, and its result would be hidden (the admin e2e
// "Generate outputs ... Done" test failed this way).
describe('Validate and Generate wait for the test list their verdict key needs', () => {
  it('both buttons stay disabled until the tests have loaded', async () => {
    setup([adminProblem()], '/admin/problems/p_1?tab=reference', { testsDelayMs: 300 });
    const validateButton = await screen.findByRole('button', { name: 'Validate' });
    const generateButton = screen.getByRole('button', { name: 'Generate outputs' });
    expect(validateButton).toBeDisabled();
    expect(generateButton).toBeDisabled();
    expect(screen.getAllByText('Waiting for the test list to load.')).toHaveLength(2);
    await waitFor(() => expect(generateButton).toBeEnabled());
    expect(validateButton).toBeEnabled();
  });

  it('Generate outputs started as soon as it can be still shows Done once the tests have loaded', async () => {
    const user = userEvent.setup();
    const { queryClient } = setup([adminProblem()], '/admin/problems/p_1?tab=reference', {
      testsDelayMs: 300,
    });
    const button = await screen.findByRole('button', { name: 'Generate outputs' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await screen.findByText('Done', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() =>
      expect(queryClient.getQueryState(qk.admin.problems.tests('p_1'))?.status).toBe('success'),
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});

describe('the problem editor shows and saves the problem it is on (A-R3-04)', () => {
  const p2 = () =>
    adminProblem({
      id: 'p_2',
      slug: 'second-problem',
      title: 'Second Problem',
      statementMd: 'The second statement.',
      referenceSolution: 'print("two")\n',
    });

  it('opening problem B after A shows B and saving writes B, never A', async () => {
    const user = userEvent.setup();
    const { api, router, queryClient } = setup(
      [adminProblem(), p2()],
      '/admin/problems/p_1?tab=reference',
    );
    // B's detail is already cached (opened earlier), so the page shows it without a loading state.
    queryClient.setQueryData(qk.admin.problems.detail('p_2'), p2());
    await user.clear(await screen.findByTestId('monaco'));
    await user.type(code(), 'p1 draft');
    act(() => {
      void router.navigate('/admin/problems/p_2?tab=reference');
    });
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/problems/p_2'));
    await waitFor(() => expect(code()).toHaveValue('print("two")\n'));
    expect(screen.getByText('Saved.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByLabelText('Statement (Markdown)', { selector: 'textarea' })).toHaveValue(
      'The second statement.',
    );

    await user.click(screen.getByRole('tab', { name: 'Reference' }));
    await user.type(code(), '# b');
    await user.click(screen.getByRole('button', { name: 'Save reference' }));
    await screen.findByText('Saved.');
    const puts = api.requests.filter((request) => request.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.path).toBe('/api/admin/problems/p_2');
    expect(puts[0]?.body).toMatchObject({
      title: 'Second Problem',
      referenceSolution: 'print("two")\n# b',
    });
  });

  it('a clean Reference panel re-reads a newer reference saved elsewhere', async () => {
    const { stored, refetch } = setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    expect(await screen.findByTestId('monaco')).toHaveValue('print(1)\n');
    stored.set('p_1', {
      ...stored.get('p_1')!,
      referenceSolution: 'print("newer")\n',
      updatedAt: '2026-10-09T10:00:00.000Z',
    });
    await refetch();
    await waitFor(() => expect(code()).toHaveValue('print("newer")\n'));
    expect(screen.getByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save reference' })).toBeDisabled();
  });

  it('an unsaved reference keeps its edits when a newer one is saved elsewhere', async () => {
    const user = userEvent.setup();
    const { stored, refetch } = setup([adminProblem()], '/admin/problems/p_1?tab=reference');
    await user.type(await screen.findByTestId('monaco'), '# mine');
    stored.set('p_1', {
      ...stored.get('p_1')!,
      referenceSolution: 'print("newer")\n',
      updatedAt: '2026-10-09T10:00:00.000Z',
    });
    await refetch();
    await screen.findByText('Unsaved changes.');
    expect(code()).toHaveValue('print(1)\n# mine');
  });
});
