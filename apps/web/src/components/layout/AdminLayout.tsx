import { FileCode, Gauge, ScanSearch, ShieldCheck, Trophy, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/cn';
import { ADMIN_NAV } from './nav';
import { PageNestingContext } from './page-context';

const ICONS: Record<(typeof ADMIN_NAV)[number]['to'], ReactNode> = {
  '/admin': <Gauge />,
  '/admin/problems': <FileCode />,
  '/admin/contests': <Trophy />,
  '/admin/plagiarism': <ScanSearch />,
  '/admin/users': <Users />,
};

/** /admin layout: section sidebar (a scrolling tab strip on small screens) and the page. */
export function AdminLayout() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10 lg:px-8 lg:py-10">
      <aside className="lg:w-56 lg:shrink-0">
        <div className="mb-3 hidden items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted lg:flex">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Admin
        </div>
        <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0">
          <ul className="flex gap-1 lg:sticky lg:top-20 lg:flex-col">
            {ADMIN_NAV.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
                      isActive
                        ? 'bg-primary-soft text-primary-text'
                        : 'text-muted hover:bg-raised hover:text-foreground',
                    )
                  }
                >
                  <span aria-hidden="true" className="flex">
                    {ICONS[item.to]}
                  </span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <PageNestingContext value="nested">
          <Outlet />
        </PageNestingContext>
      </div>
    </div>
  );
}
