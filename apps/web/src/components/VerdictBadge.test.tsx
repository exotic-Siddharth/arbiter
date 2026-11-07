import { VERDICT_IDS, VERDICTS } from '@arbiter/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictBadge } from './VerdictBadge';

describe('VerdictBadge', () => {
  it('renders label for each verdict', () => {
    for (const verdict of VERDICT_IDS) {
      const { unmount } = render(<VerdictBadge verdict={verdict} status="DONE" />);
      expect(screen.getByText(VERDICTS[verdict].label)).toBeInTheDocument();
      unmount();
    }
  });

  it('short variant shows the code and keeps the full label for screen readers', () => {
    render(<VerdictBadge verdict="WA" variant="short" />);
    expect(screen.getByText('WA')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Wrong Answer')).toHaveClass('sr-only');
  });

  it('colours the badge with the verdict token', () => {
    render(<VerdictBadge verdict="AC" />);
    const badge = screen.getByText('Accepted').closest('[data-verdict]');
    expect(badge).toHaveAttribute('data-verdict', 'AC');
    expect(badge).toHaveStyle({ '--badge-color': 'var(--color-verdict-ac)' });
  });

  it('renders queued, compiling and running states as pending with progress', () => {
    const { rerender } = render(<VerdictBadge verdict={null} status="QUEUED" />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
    rerender(<VerdictBadge verdict={null} status="COMPILING" />);
    expect(screen.getByText('Compiling')).toBeInTheDocument();
    rerender(<VerdictBadge verdict={null} status="RUNNING" testsDone={3} testsTotal={12} />);
    expect(screen.getByText('Running 3/12')).toBeInTheDocument();
    expect(screen.getByText('Running 3/12').closest('[data-verdict]')).toHaveAttribute(
      'data-verdict',
      'pending',
    );
  });

  it('shows the judge failure when a FAILED submission has no verdict', () => {
    render(<VerdictBadge verdict={null} status="FAILED" />);
    expect(screen.getByText('Judge failed')).toBeInTheDocument();
  });
});
