import { render, screen } from '@testing-library/react';
import type { RunResult } from '@arbiter/shared';
import { describe, expect, it } from 'vitest';
import { RunOutput } from './RunOutput';

const ok: RunResult = {
  status: 'OK',
  stdout: '3\n',
  stderr: '',
  timeMs: 12,
  memoryKb: 1024,
} as RunResult;

describe('RunOutput live region', () => {
  it('announces the running state politely', () => {
    render(<RunOutput phase="running" result={null} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Running on your input');
  });

  it('keeps one live region across phases and announces the result', () => {
    const { rerender } = render(<RunOutput phase="running" result={null} />);
    const region = screen.getByRole('status');
    rerender(<RunOutput phase="done" result={ok} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Finished');
  });

  it('flags an unavailable judge as an alert', () => {
    render(<RunOutput phase="unavailable" result={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Judge unavailable');
  });

  it('announces only a one-line summary, not the program output or the diff (A-R2-15)', () => {
    const sample = { ordinal: 1, input: '1 2\n', expectedOutput: '3\n', explanation: null };
    const { rerender } = render(<RunOutput phase="running" result={null} sample={sample} />);
    const region = screen.getByRole('status');
    const long = { ...ok, stdout: 'line of output\n'.repeat(300), stderr: 'warning: noisy\n' };
    rerender(<RunOutput phase="done" result={long} sample={sample} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe(
      'Finished · 12 ms · 1.0 MB · Differs from the expected output of sample 1',
    );
    // The output itself is still shown, outside the live region.
    expect(screen.getAllByText(/line of output/).length).toBeGreaterThan(0);

    rerender(<RunOutput phase="done" result={ok} sample={sample} />);
    expect(region.textContent).toBe(
      'Finished · 12 ms · 1.0 MB · Matches the expected output of sample 1',
    );
  });

  it('does not nest the unavailable alert inside the status region (A-R2-15)', () => {
    render(<RunOutput phase="unavailable" result={null} />);
    expect(screen.getByRole('status')).not.toContainElement(screen.getByRole('alert'));
  });
});
