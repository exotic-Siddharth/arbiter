import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: 'var(--color-muted)',
  primary: 'var(--color-primary-text)',
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
};

export interface BadgeProps extends ComponentProps<'span'> {
  /** Semantic colour (ignored when `color` is set). */
  tone?: BadgeTone;
  /** Any CSS colour, e.g. 'var(--color-verdict-ac)' or 'var(--color-tier-blue)'. */
  color?: string;
  /** soft = tinted fill (default), outline = border only, solid = filled with white text. */
  variant?: 'soft' | 'outline' | 'solid';
  size?: 'sm' | 'md';
  /** Leading dot in the badge colour; `pulse` animates it (live/pending states). */
  dot?: boolean | 'pulse';
  icon?: ReactNode;
  /** JetBrains Mono with tabular numerals (verdict chips, numbers). */
  mono?: boolean;
  pill?: boolean;
}

/** Small status label. Colour comes from `tone` or any CSS colour via `color`. */
export function Badge({
  tone = 'neutral',
  color,
  variant = 'soft',
  size = 'md',
  dot = false,
  icon,
  mono = false,
  pill = false,
  className,
  style,
  children,
  ...props
}: BadgeProps) {
  const badgeStyle = { '--badge-color': color ?? TONE_COLOR[tone], ...style } as CSSProperties;
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 border font-medium leading-none whitespace-nowrap',
        size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
        pill ? 'rounded-full' : 'rounded-md',
        mono && 'font-mono tabular-nums tracking-tight',
        variant === 'soft' &&
          'border-(--badge-color)/25 bg-(--badge-color)/12 text-(--badge-color)',
        variant === 'outline' && 'border-(--badge-color)/45 bg-transparent text-(--badge-color)',
        variant === 'solid' && 'border-transparent bg-(--badge-color) text-white',
        tone === 'neutral' && !color && variant === 'soft' && 'border-border bg-raised text-muted',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
      style={badgeStyle}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
          {dot === 'pulse' ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          ) : null}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {icon}
      {children}
    </span>
  );
}
