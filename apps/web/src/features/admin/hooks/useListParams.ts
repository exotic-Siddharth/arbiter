import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { parsePageParam } from '@/lib/page';

const SEARCH_DELAY_MS = 300;

/**
 * Page number and search text of an admin list, kept in the URL (?page=2&q=abc) so a reload or
 * a shared link lands on the same view. The search box is debounced and resets the page.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const page = parsePageParam(params.get('page'));
  const search = params.get('q') ?? '';
  const [text, setText] = useState(search);
  const lastPushed = useRef(search);

  // Back/forward navigation changes ?q: follow it unless it is our own update.
  useEffect(() => {
    if (search !== lastPushed.current) {
      lastPushed.current = search;
      setText(search);
    }
  }, [search]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === lastPushed.current) return undefined;
    const timer = setTimeout(() => {
      lastPushed.current = trimmed;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (trimmed) next.set('q', trimmed);
          else next.delete('q');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, setParams]);

  const setPage = useCallback(
    (next: number) => {
      setParams(
        (previous) => {
          const copy = new URLSearchParams(previous);
          if (next > 1) copy.set('page', String(next));
          else copy.delete('page');
          return copy;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { page, setPage, search, text, setText };
}
