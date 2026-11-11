import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingBadge } from './RatingBadge';

describe('RatingBadge', () => {
  it.each([
    [1199, 'Initiate', 'gray'],
    [1200, 'Apprentice', 'green'],
    [1450, 'Adept', 'cyan'],
    [1650, 'Expert', 'blue'],
    [2000, 'Master', 'violet'],
    [2200, 'Grandmaster', 'amber'],
  ])('rating %i is %s (%s)', (rating, tier, colour) => {
    render(<RatingBadge rating={rating} />);
    const badge = screen.getByText(String(rating)).closest('[data-tier]');
    expect(badge).toHaveAttribute('data-tier', tier);
    expect(badge).toHaveStyle({ '--badge-color': `var(--color-tier-${colour})` });
    expect(screen.getByText(tier)).toBeInTheDocument();
  });

  it('can hide the tier name visually but keeps it for screen readers', () => {
    render(<RatingBadge rating={1650} showTier={false} />);
    expect(screen.getByText('Expert')).toHaveClass('sr-only');
    expect(screen.getByText('1650').closest('[data-tier]')).toHaveAttribute(
      'title',
      'Expert · 1650',
    );
  });
});
