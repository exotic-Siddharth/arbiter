import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router';

/** Time for the new page to set its document title before it is announced. */
const SETTLE_MS = 150;

/**
 * Client-side navigation does not move focus or tell screen readers anything. When the pathname
 * changes (not on the first render, not for search/hash-only changes such as pagination), this
 * moves focus to <main> (without scrolling, ScrollRestoration owns that) and announces the new
 * document title in a visually hidden live region.
 */
export function RouteAnnouncer({ mainRef }: { mainRef: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // Do not pull focus out of an open modal dialog.
    if (!document.querySelector('[aria-modal="true"]')) {
      mainRef.current?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(() => setAnnouncement(document.title), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, mainRef]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  );
}
