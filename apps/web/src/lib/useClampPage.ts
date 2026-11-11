import { useEffect } from 'react';

interface PageLike {
  items: readonly unknown[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A paged list asked for a page past the end comes back empty with a positive total. Jumps to the
 * last page (via `goToPage`, which should replace the history entry) instead of letting the
 * list show a false "nothing here" state. Ignores placeholder data from a previous query.
 */
export function useClampPage(
  data: PageLike | undefined,
  isPlaceholderData: boolean,
  goToPage: (page: number) => void,
): void {
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    if (data.items.length > 0 || data.total <= 0 || data.page <= 1) return;
    const last = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (last < data.page) goToPage(last);
  }, [data, isPlaceholderData, goToPage]);
}
