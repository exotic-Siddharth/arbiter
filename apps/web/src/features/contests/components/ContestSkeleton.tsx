import { Skeleton } from '@/components/ui';

export function ContestSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading the contest" aria-busy="true">
      <Skeleton className="h-32 w-full rounded-card" />
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}
