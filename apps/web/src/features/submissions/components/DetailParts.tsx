import type { ReactNode } from 'react';
import { Skeleton, SkeletonText } from '@/components/ui';

/** One labelled fact of the submission summary card. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="min-w-0 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading submission" className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="rounded-card border border-border p-5">
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}
