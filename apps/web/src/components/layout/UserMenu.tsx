import type { Me } from '@arbiter/shared';
import { ChevronDown, ListChecks, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { RatingBadge } from '@/components/RatingBadge';
import { Avatar } from '@/components/ui/Avatar';
import { DropdownMenu, MenuItem, MenuLabel, MenuLink, MenuSeparator } from '@/components/ui/DropdownMenu';
import { useAuth } from '@/stores/auth';

/** Signed-in user's menu: profile, submissions, admin (admins only) and log out. */
export function UserMenu({ user }: { user: Me }) {
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const onLogout = async () => {
    await logout();
    toast.success('Logged out');
    if (location.pathname.startsWith('/admin')) void navigate('/');
  };

  return (
    <DropdownMenu
      triggerLabel={`Account menu for ${user.username}`}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="gap-2 pl-1 pr-1.5 sm:pr-2"
      trigger={
        <>
          <Avatar name={user.username} size="sm" />
          <span className="hidden max-w-32 truncate text-[13px] font-medium sm:inline">
            {user.username}
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
        </>
      }
    >
      <MenuLabel className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide">Signed in as</span>
          <span className="block truncate text-sm font-semibold text-foreground">{user.username}</span>
        </span>
        <RatingBadge rating={user.rating} showTier={false} size="sm" />
      </MenuLabel>
      <MenuSeparator />
      <MenuLink to={`/u/${encodeURIComponent(user.username)}`} icon={<UserRound />}>
        Your profile
      </MenuLink>
      <MenuLink to="/submissions?mine=true" icon={<ListChecks />}>
        My submissions
      </MenuLink>
      {user.role === 'ADMIN' ? (
        <MenuLink to="/admin" icon={<ShieldCheck />}>
          Admin
        </MenuLink>
      ) : null}
      <MenuSeparator />
      <MenuItem onSelect={() => void onLogout()} icon={<LogOut />}>
        Log out
      </MenuItem>
    </DropdownMenu>
  );
}
