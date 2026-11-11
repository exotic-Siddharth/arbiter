import type { Profile } from '@arbiter/shared';
import { Trophy } from 'lucide-react';
import { RatingBadge } from '@/components/RatingBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';
import { useCurrentUser } from '@/stores/auth';
import { BioEditor } from './BioEditor';

export function ProfileHeaderSkeleton() {
  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6" aria-hidden="true">
      <Skeleton className="size-20 shrink-0 rounded-full" />
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-full" />
      </div>
    </Card>
  );
}

/** Avatar, name, tier, global rank, join date and the (owner-editable) bio. */
export function ProfileHeader({ profile }: { profile: Profile }) {
  const me = useCurrentUser();
  const { user, stats } = profile;
  const isOwner = me?.username.toLowerCase() === user.username.toLowerCase();

  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
      <Avatar name={user.username} size="xl" decorative={false} className="shrink-0" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight break-all text-foreground sm:text-[1.65rem]">
            {user.username}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
            <RatingBadge rating={user.rating} />
            {stats.globalRank !== null ? (
              <Badge icon={<Trophy />} tone="neutral">
                Global rank #{stats.globalRank}
              </Badge>
            ) : (
              <Badge tone="neutral">Unranked</Badge>
            )}
            <span>Joined {formatDate(user.createdAt)}</span>
          </div>
        </div>
        {isOwner ? (
          <BioEditor username={user.username} bio={user.bio} />
        ) : user.bio ? (
          <p className="max-w-2xl text-[15px] break-words whitespace-pre-line text-foreground/90">
            {user.bio}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
