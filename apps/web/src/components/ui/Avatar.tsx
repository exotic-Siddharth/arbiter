import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const PALETTE = [
  'var(--color-primary-text)',
  'var(--color-accent)',
  'var(--color-difficulty-easy)',
  'var(--color-tier-blue)',
  'var(--color-verdict-re)',
  'var(--color-tier-amber)',
  'var(--color-verdict-wa)',
  'var(--color-tier-green)',
];

function hueFor(name: string): string {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? 'var(--color-primary-text)';
}

const SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-[13px]',
  lg: 'size-12 text-base',
  xl: 'size-20 text-2xl',
} as const;

export interface AvatarProps {
  /** Username; the avatar shows its initials in a colour derived from it. */
  name: string;
  size?: keyof typeof SIZES;
  /** Hide from assistive tech when the name is shown next to it (default true). */
  decorative?: boolean;
  className?: string;
}

/** Initials avatar (no uploaded images). */
export function Avatar({ name, size = 'md', decorative = true, className }: AvatarProps) {
  const style = { '--avatar-color': hueFor(name) } as CSSProperties;
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      style={style}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full border border-(--avatar-color)/30 bg-(--avatar-color)/15 font-semibold uppercase tracking-tight text-(--avatar-color)',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
