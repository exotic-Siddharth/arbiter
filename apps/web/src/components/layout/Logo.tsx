import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface LogoProps {
  className?: string;
  /** Accessible name; omit when the logo sits next to the visible word "Arbiter". */
  title?: string;
}

/** Arbiter mark: code brackets around an "accepted" check, on a violet tile. */
export function Logo({ className, title }: LogoProps) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('size-7 shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f74ff" />
          <stop offset="1" stopColor="#5b3fd9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <path
        d="M11.5 10 6.75 16l4.75 6M20.5 10l4.75 6-4.75 6"
        fill="none"
        stroke="#fff"
        strokeOpacity=".6"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12.6 16.4 2.5 2.5 4.9-5.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
