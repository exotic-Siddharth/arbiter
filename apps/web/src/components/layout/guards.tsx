import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner } from '@/components/ui/Spinner';
import { loginHref, safeRedirectPath } from '@/lib/url';
import { useAuth } from '@/stores/auth';

interface GuardProps {
  /** Rendered when allowed (default: the child routes' <Outlet />). */
  children?: ReactNode;
}

/** Signed-in users only; guests go to /login?next=<this page>. */
export function RequireAuth({ children }: GuardProps) {
  const status = useAuth((state) => state.status);
  const location = useLocation();
  if (status === 'unknown') return <PageSpinner label="Checking your session…" />;
  if (status === 'guest') {
    return <Navigate to={loginHref(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Admins only; guests go to /login, signed-in non-admins see a 403 state. */
export function RequireAdmin({ children }: GuardProps) {
  const status = useAuth((state) => state.status);
  const role = useAuth((state) => state.user?.role);
  const location = useLocation();
  if (status === 'unknown') return <PageSpinner label="Checking your session…" />;
  if (status === 'guest') {
    return <Navigate to={loginHref(`${location.pathname}${location.search}`)} replace />;
  }
  if (role !== 'ADMIN') {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          icon={<ShieldAlert />}
          title="Admins only"
          description="Your account doesn't have access to the admin area."
          action={<ButtonLink to="/">Back to Arbiter</ButtonLink>}
        />
      </div>
    );
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * Login/register pages: signed-in users are sent on to ?next= (or home). This is also what
 * redirects right after a successful login/registration, so the pages need not navigate.
 */
export function GuestOnly({ children }: GuardProps) {
  const status = useAuth((state) => state.status);
  const [params] = useSearchParams();
  if (status === 'unknown') return <PageSpinner label="Checking your session…" />;
  if (status === 'authenticated')
    return <Navigate to={safeRedirectPath(params.get('next'))} replace />;
  return <>{children ?? <Outlet />}</>;
}
