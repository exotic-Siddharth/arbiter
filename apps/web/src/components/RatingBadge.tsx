import { getRatingTier } from '@arbiter/shared';
import type { CSSProperties } from 'react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { tierColor } from './tier';

export interface RatingBadgeProps {
  rating: number;
  /** Show the tier name ("Expert") next to the number (default true; always read aloud). */
  showTier?: boolean;
  /** badge = tinted pill (default), text = coloured number only (tables). */
  variant?: 'badge' | 'text';
  size?: 'sm' | 'md';
  className?: string;
}

/** Rating coloured by its spec 13.1 tier (Initiate … Grandmaster). */
export function RatingBadge({
  rating,
  showTier = true,
  variant = 'badge',
  size = 'md',
  className,
}: RatingBadgeProps) {
  const tier = getRatingTier(rating);
  const color = tierColor(rating);
  const tierLabel = (
    <span className={showTier ? (variant === 'text' ? 'font-sans font-medium' : 'font-sans') : 'sr-only'}>
      {tier.name}
    </span>
  );

  if (variant === 'text') {
    return (
      <span
        data-tier={tier.name}
        title={`${tier.name} · ${rating}`}
        style={{ '--badge-color': color, color } as CSSProperties}
        className={cn('inline-flex items-baseline gap-1.5 font-mono font-semibold tabular-nums', className)}
      >
        <span>{rating}</span>
        {tierLabel}
      </span>
    );
  }

  return (
    <Badge
      data-tier={tier.name}
      title={`${tier.name} · ${rating}`}
      color={color}
      size={size}
      mono
      className={className}
    >
      <span>{rating}</span>
      {tierLabel}
    </Badge>
  );
}
