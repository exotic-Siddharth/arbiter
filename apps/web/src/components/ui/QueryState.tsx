import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { ErrorState } from './EmptyState';
import { PageSpinner } from './Spinner';

/** The parts of a TanStack Query result that QueryState reads. */
export interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching?: boolean;
  refetch: () => unknown;
}

export interface QueryStateProps<T> {
  query: QueryLike<T>;
  /** Loading UI, usually a skeleton shaped like the content (default: spinner). */
  loading?: ReactNode;
  /** Shown instead of children when isEmpty(data) is true. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorTitle?: ReactNode;
  /** Compact error/empty spacing (inside cards). */
  compact?: boolean;
  children: (data: T) => ReactNode;
}

/**
 * Loading / error / empty / data switch for one query, so every data view has all four states
 * (spec 13.1):
 *
 *   <QueryState query={problems} loading={<TableSkeleton />} isEmpty={(d) => d.items.length === 0}
 *     empty={<EmptyState title="No problems match" />}>
 *     {(data) => <ProblemTable page={data} />}
 *   </QueryState>
 */
export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  errorTitle,
  compact = false,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" aria-busy="true">
        {loading ?? <PageSpinner className="min-h-48" />}
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <ErrorState
        error={query.error}
        title={errorTitle}
        compact={compact}
        retrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  // A failed background refetch keeps the data TanStack still holds: show it with a banner.
  const body =
    empty !== undefined && isEmpty?.(query.data) ? <>{empty}</> : <>{children(query.data)}</>;
  if (!query.isError) return body;
  return (
    <>
      <div
        role="status"
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-foreground"
      >
        <span>Could not refresh this data. Showing what was loaded earlier.</span>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw />}
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </div>
      {body}
    </>
  );
}
