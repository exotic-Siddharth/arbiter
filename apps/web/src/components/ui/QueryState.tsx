import type { ReactNode } from 'react';
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
  if (query.isError || query.data === undefined) {
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
  if (empty !== undefined && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
