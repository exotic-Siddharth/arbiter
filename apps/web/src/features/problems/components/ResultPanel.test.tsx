import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { submissionDetail } from '@/features/submissions/test/fixtures';
import { progressFromSubmission } from '../lib/progress';
import { ResultPanel } from './ResultPanel';

function renderPanel(detail: ReturnType<typeof submissionDetail>) {
  return renderWithProviders(
    <ResultPanel progress={progressFromSubmission(detail)} detail={detail} />,
  );
}

// Page tests render the whole feature (lazy editor, several queries); the shared machine is slow.
describe('ResultPanel', { timeout: 20_000 }, () => {
  it('renders failed sample diff', () => {
    renderPanel(
      submissionDetail({
        status: 'DONE',
        verdict: 'WA',
        testsPassed: 1,
        testsTotal: 12,
        timeMs: 31,
        memoryKb: 10240,
        results: [
          { ordinal: 1, verdict: 'AC', timeMs: 30, memoryKb: 10240, isSample: true },
          { ordinal: 2, verdict: 'WA', timeMs: 31, memoryKb: 10240, isSample: true },
        ],
        failedSample: {
          ordinal: 2,
          input: '3\n4 5 6\n',
          expectedOutput: '15\nyes\n',
          actualOutput: '14\nyes\n',
          stderr: '',
        },
      }),
    );

    expect(screen.getByRole('heading', { name: 'Wrong Answer' })).toBeInTheDocument();
    expect(screen.getByText('1 / 12 tests passed')).toBeInTheDocument();

    const diff = screen.getByRole('region', { name: 'Failed sample 2' });
    expect(within(diff).getByText('Input')).toBeInTheDocument();
    expect(within(diff).getByText('Expected output')).toBeInTheDocument();
    expect(within(diff).getByText('Your output')).toBeInTheDocument();
    // The differing line is marked on both sides; the equal one is not.
    const expected = within(diff).getByTestId('diff-expected');
    const actual = within(diff).getByTestId('diff-actual');
    expect(within(expected).getByText('15').closest('[data-diff]')).toHaveAttribute(
      'data-diff',
      'changed',
    );
    expect(within(actual).getByText('14').closest('[data-diff]')).toHaveAttribute(
      'data-diff',
      'changed',
    );
    expect(within(actual).getByText('yes').closest('[data-diff]')).toHaveAttribute(
      'data-diff',
      'same',
    );
  });

  it('renders IE copy', () => {
    renderPanel(
      submissionDetail({
        status: 'FAILED',
        verdict: 'IE',
        testsPassed: 0,
        testsTotal: 12,
        timeMs: null,
        memoryKb: null,
      }),
    );

    expect(screen.getByRole('heading', { name: 'Judge unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/not a problem with your code/i)).toBeInTheDocument();
    // A final state: no pending stepper step, no spinner.
    expect(screen.queryByText(/^Running/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('shows compile output for CE', () => {
    renderPanel(
      submissionDetail({
        status: 'DONE',
        verdict: 'CE',
        testsPassed: 0,
        compileOutput: "main.cpp:3:5: error: 'cot' was not declared in this scope",
      }),
    );
    expect(screen.getByRole('heading', { name: 'Compilation Error' })).toBeInTheDocument();
    expect(screen.getByText(/'cot' was not declared/)).toBeInTheDocument();
  });

  it('shows the stepper and progress while running', () => {
    renderPanel(
      submissionDetail({
        status: 'RUNNING',
        verdict: null,
        testsPassed: 2,
        testsTotal: 12,
        results: [
          { ordinal: 1, verdict: 'AC', timeMs: 30, memoryKb: 10240, isSample: true },
          { ordinal: 2, verdict: 'AC', timeMs: 30, memoryKb: 10240, isSample: true },
        ],
      }),
    );
    expect(screen.getByText('Running 2/12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tests judged' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    expect(screen.getAllByRole('listitem', { name: /^Test \d+/ })).toHaveLength(12);
  });
});
