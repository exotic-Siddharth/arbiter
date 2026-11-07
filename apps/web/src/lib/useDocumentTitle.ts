import { useEffect } from 'react';

/** Sets the tab title to "<title> · Arbiter" ("Arbiter" for no title) while mounted. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Arbiter` : 'Arbiter';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
