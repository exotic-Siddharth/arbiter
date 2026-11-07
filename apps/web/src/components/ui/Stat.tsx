import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

export interface StatProps {
  label: ReactNode;
  /** The figure (format it first, e.g. formatNumber(n)). */
  value: ReactNode;
  /** Small line under the value ("+12 today", "of 15 available"). */
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** Stat card for landing stats, profile stat cards and the judge monitor. */
export function Stat({ label, value, hint, icon, loading = false, className }: StatProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="flex text-muted [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-20" />
      ) : (
        <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
