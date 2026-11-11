import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/button-styles';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { loginHref, registerHref } from '@/lib/url';
import { useAuth } from '@/stores/auth';
import { Logo } from './Logo';
import { MAIN_NAV } from './nav';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-150',
    isActive ? 'bg-raised text-foreground' : 'text-muted hover:bg-raised/60 hover:text-foreground',
  );

/** Sticky top bar: logo, primary nav, theme toggle, auth actions or the user menu. */
export function Navbar() {
  const user = useAuth((state) => state.user);
  const status = useAuth((state) => state.status);
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="-ml-1 flex shrink-0 items-center gap-2.5 rounded-control px-1 py-1 text-[15px] font-semibold tracking-tight"
        >
          <Logo />
          <span>Arbiter</span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 md:flex">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {status === 'authenticated' && user ? (
            <UserMenu user={user} />
          ) : status === 'guest' ? (
            <div className="flex items-center gap-1.5">
              <ButtonLink to={loginHref(here)} variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to={registerHref(here)} size="sm" className="hidden sm:inline-flex">
                Sign up
              </ButtonLink>
            </div>
          ) : (
            <Skeleton className="h-8 w-28" />
          )}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className={buttonStyles({
              variant: 'ghost',
              size: 'sm',
              iconOnly: true,
              className: 'md:hidden',
            })}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id={menuId}
          className="border-t border-border bg-background md:hidden animate-slide-down"
        >
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6"
          >
            {MAIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn(navLinkClass({ isActive }), 'py-2')}
              >
                {item.label}
              </NavLink>
            ))}
            {status === 'guest' ? (
              <div className="mt-2 border-t border-border pt-3 sm:hidden">
                <ButtonLink to={registerHref(here)} size="md" fullWidth>
                  Create an account
                </ButtonLink>
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
