import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { parsePageParam } from '@/lib/page';

export type FilterValues<K extends string> = Record<K, string>;

export interface UrlFilters<K extends string> {
  /** Current values ('' when absent; defaults applied). */
  values: FilterValues<K>;
  /** 1-based page from ?page. */
  page: number;
  /** True when any filter differs from its default. */
  active: boolean;
  /** Merge a patch into the URL; filters reset the page unless `page` is in the patch. */
  set: (
    patch: Partial<FilterValues<K>> & { page?: number },
    options?: { replace?: boolean },
  ) => void;
  setPage: (page: number) => void;
  clear: () => void;
}

/**
 * Filter state kept in the URL search params, so lists are shareable and survive reloads.
 * Values equal to their default (and page 1) are left out of the URL.
 */
export function useUrlFilters<K extends string>(defaults: FilterValues<K>): UrlFilters<K> {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsRef = useRef(defaults);
  const keys = Object.keys(defaults) as K[];

  const values = useMemo(() => {
    const result = {} as FilterValues<K>;
    for (const key of Object.keys(defaultsRef.current) as K[]) {
      result[key] = searchParams.get(key)?.trim() || defaultsRef.current[key];
    }
    return result;
  }, [searchParams]);

  const page = parsePageParam(searchParams.get('page'));

  const set = useCallback<UrlFilters<K>['set']>(
    (patch, options) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch) as [string, unknown][]) {
            if (key === 'page') continue;
            const text = typeof value === 'string' ? value.trim() : '';
            const fallback = defaultsRef.current[key as K];
            if (!text || text === fallback) next.delete(key);
            else next.set(key, text);
          }
          if (patch.page !== undefined && patch.page > 1) next.set('page', String(patch.page));
          else next.delete('page');
          return next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (next: number) => set({ page: next } as Partial<FilterValues<K>> & { page?: number }),
    [set],
  );

  const clear = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const active = keys.some((key) => values[key] !== defaults[key]);
  return { values, page, active, set, setPage, clear };
}

/**
 * A text input value that follows the URL but writes back only after `delayMs` of no typing.
 * Returns [draft, setDraft].
 */
export function useDebouncedUrlValue(
  urlValue: string,
  commit: (value: string) => void,
  delayMs = 300,
): [string, (value: string) => void] {
  const [draft, setDraft] = useState(urlValue);
  const [synced, setSynced] = useState(urlValue);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  // The URL changed elsewhere (back button, "clear filters"): show it.
  if (urlValue !== synced) {
    setSynced(urlValue);
    setDraft(urlValue);
  }

  useEffect(() => {
    if (draft.trim() === urlValue.trim()) return;
    const timer = setTimeout(() => commitRef.current(draft), delayMs);
    return () => clearTimeout(timer);
  }, [draft, urlValue, delayMs]);

  return [draft, setDraft];
}
