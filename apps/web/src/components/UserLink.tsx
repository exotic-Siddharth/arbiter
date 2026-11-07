import { Link } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/cn';
import { tierColor } from './tier';

export interface UserLinkProps {
  username: string;
  /** Colours the name by rating tier (scoreboards, leaderboard, submissions). */
  rating?: number;
  showAvatar?: boolean;
  className?: string;
}

/** Username linking to /u/:username, optionally tier-coloured and with an initials avatar. */
export function UserLink({ username, rating, showAvatar = false, className }: UserLinkProps) {
  return (
    <Link
      to={`/u/${encodeURIComponent(username)}`}
      style={rating === undefined ? undefined : { color: tierColor(rating) }}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-sm font-medium hover:underline hover:underline-offset-2',
        rating === undefined && 'text-foreground',
        className,
      )}
    >
      {showAvatar ? <Avatar name={username} size="xs" /> : null}
      <span className="truncate">{username}</span>
    </Link>
  );
}
