import { useCallback, useSyncExternalStore } from 'react';

/** True while the CSS media query matches (false where matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const snapshot = () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** The workspace splits into resizable panels from Tailwind's lg breakpoint (1024 px) up. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
