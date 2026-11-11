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
});
