import { getRatingTier, type RatingTier } from '@arbiter/shared';

/** CSS colour of a rating's tier, e.g. tierColor(1650) === 'var(--color-tier-blue)'. */
export function tierColor(rating: number): string {
  return `var(--color-tier-${getRatingTier(rating).color})`;
}

/** CSS colour for a tier object (chart bands, legends). */
export function tierColorOf(tier: Pick<RatingTier, 'color'>): string {
  return `var(--color-tier-${tier.color})`;
}
