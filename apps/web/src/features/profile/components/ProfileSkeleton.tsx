import { Skeleton } from '@/components/ui/Skeleton';
import { Stat } from '@/components/ui/Stat';
import { ProfileHeaderSkeleton } from './ProfileHeader';

export const PROFILE_FRAME =
  'mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8';

export function ProfileSkeleton() {
  return (
    <div className={PROFILE_FRAME} role="status" aria-label="Loading profile" aria-busy="true">
      <ProfileHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Stat key={index} label="Loading" value="" loading />
        ))}
      </div>
      <Skeleton className="h-52 w-full rounded-card" />
      <Skeleton className="h-80 w-full rounded-card" />
    </div>
  );
}
