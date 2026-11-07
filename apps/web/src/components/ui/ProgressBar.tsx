import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ProgressBarProps {
  /** Current value; omit for an indeterminate bar. */
  value?: number;
  max?: number;
  /** Accessible name, e.g. "Tests passed". */
  label: string;
  /** Spoken value, e.g. "3 of 12 tests" (default "N%"). */
  valueText?: string;
  /** Bar colour: any CSS colour (default primary), e.g. 'var(--color-verdict-ac)'. */
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  /** Visible label row above the bar: left label and right value. */
  showLabel?: boolean;
  /** Right side of the label row (default "value / max"). */
  valueLabel?: ReactNode;
  className?: string;
}

/** Determinate or indeterminate progress (role="progressbar"), e.g. judge progress 3/12. */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  color = 'var(--color-primary)',
  size = 'sm',
  showLabel = false,
  valueLabel,
  className,
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const ratio = indeterminate || max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const style = { '--bar-color': color } as CSSProperties;
  return (
    <div className={cn('w-full', className)} style={style}>
      {showLabel ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-foreground">{label}</span>
          <span className="font-mono tabular-nums text-muted">
            {valueLabel ?? (indeterminate ? null : `${value} / ${max}`)}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : max}
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuetext={indeterminate ? undefined : (valueText ?? `${Math.round(ratio * 100)}%`)}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-raised dark:bg-raised-hover',
          size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        {indeterminate ? (
          <div className="absolute inset-y-0 left-0 w-2/5 animate-progress-indeterminate rounded-full bg-(--bar-color)" />
        ) : (
          <div
            className="h-full rounded-full bg-(--bar-color) transition-[width] duration-200 ease-out"
            style={{ width: `${ratio * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
