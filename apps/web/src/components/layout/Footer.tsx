import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from './Logo';

const linkClass = 'rounded-sm text-muted transition-colors hover:text-foreground';

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</p>
      <ul className="space-y-2 text-sm">{children}</ul>
    </div>
  );
}

/** Site footer: brand line and link columns. */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:px-8">
        <div className="max-w-sm space-y-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-control font-semibold tracking-tight">
            <Logo className="size-6" />
            Arbiter
          </Link>
          <p className="text-sm text-muted">
            An online judge with Docker-sandboxed execution, live verdicts and ICPC-style contests.
          </p>
        </div>
        {/* Three short columns side by side on phones; grid items of the parent from md up. */}
        <nav aria-label="Footer" className="grid grid-cols-3 gap-4 md:contents">
          <FooterColumn title="Practice">
            <li>
              <Link to="/problems" className={linkClass}>
                Problems
              </Link>
            </li>
            <li>
              <Link to="/submissions" className={linkClass}>
                Submissions
              </Link>
            </li>
          </FooterColumn>
          <FooterColumn title="Compete">
            <li>
              <Link to="/contests" className={linkClass}>
                Contests
              </Link>
            </li>
            <li>
              <Link to="/leaderboard" className={linkClass}>
                Leaderboard
              </Link>
            </li>
          </FooterColumn>
          <FooterColumn title="Developers">
            <li>
              <a href="/api/docs" className={linkClass}>
                API reference
              </a>
            </li>
            <li>
              <a href="/api/openapi.json" className={linkClass}>
                OpenAPI
              </a>
            </li>
          </FooterColumn>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          <p>© {year} Arbiter · MIT License</p>
          <p>Every submission runs in a throwaway, network-less container.</p>
        </div>
      </div>
    </footer>
  );
}
