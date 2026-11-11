import { useRef } from 'react';
import { Outlet, ScrollRestoration, useMatches } from 'react-router';
import { cn } from '@/lib/cn';
import { Footer } from './Footer';
import { Navbar } from './Navbar';
import { NavigationProgress } from './NavigationProgress';
import { RouteAnnouncer } from './RouteAnnouncer';

/** Route `handle` read by the shell (set in router.tsx). */
export interface RouteHandle {
  /** 'workspace': full-viewport page (problem workspace) without the footer. */
  layout?: 'workspace';
}

/**
 * Root layout: skip link, sticky Navbar, routed page, Footer. Workspace routes get a
 * viewport-height main area (from lg up) and no footer.
 */
export function AppShell() {
  const matches = useMatches();
  const mainRef = useRef<HTMLElement>(null);
  const workspace = matches.some(
    (match) => (match.handle as RouteHandle | undefined)?.layout === 'workspace',
  );

  return (
    <div className={cn('flex min-h-dvh flex-col', workspace && 'lg:h-dvh lg:overflow-hidden')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary focus:shadow-lg"
      >
        Skip to content
      </a>
      <NavigationProgress />
      <Navbar />
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={cn('flex flex-1 flex-col outline-none', workspace && 'min-h-0')}
      >
        <Outlet />
      </main>
      {workspace ? null : <Footer />}
      <RouteAnnouncer mainRef={mainRef} />
      <ScrollRestoration />
    </div>
  );
}
