import { Skeleton } from '@/components/ui';

export function ContestListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-[7.5rem] w-full rounded-card" />
      ))}
    </div>
  );
}
