import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Pulsing placeholder block; size it with classes, e.g. <Skeleton className="h-4 w-40" />. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-raised dark:bg-raised-hover/70', className)}
      {...props}
    />
  );
}

const LINE_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-full', 'w-3/4', 'w-5/6', 'w-2/3'];

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** A paragraph of skeleton lines (the last one shorter). */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn(
            'h-3.5',
            index === lines - 1 && lines > 1 ? 'w-1/2' : LINE_WIDTHS[index % LINE_WIDTHS.length],
          )}
        />
      ))}
    </div>
  );
}
