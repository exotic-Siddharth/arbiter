import { Skeleton } from '@/components/ui';

/** Loading state shaped like the workspace (statement left, editor and console right). */
export function WorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading problem"
      className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[44fr_56fr]"
    >
      <div className="space-y-4 rounded-card border border-border bg-surface p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-2 pt-4">
          {[92, 84, 96, 70, 88, 60].map((width, index) => (
            <Skeleton key={index} className="h-3.5" style={{ width: `${width}%` }} />
          ))}
        </div>
        <Skeleton className="h-28 w-full" />
      </div>
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="flex-[2] rounded-card" />
        <Skeleton className="flex-1 rounded-card" />
      </div>
    </div>
  );
}
