import { ProfileSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { useParams } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryState } from '@/components/ui/QueryState';
import { api, isApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Heatmap } from './components/Heatmap';
import { ProfileHeader } from './components/ProfileHeader';
import { PROFILE_FRAME as FRAME, ProfileSkeleton } from './components/ProfileSkeleton';
import {
  DifficultyBars,
  LanguageBreakdown,
  RecentAccepted,
  StatCards,
} from './components/ProfilePanels';
import { RatingChart } from './components/RatingChart';

export function Component() {
  const { username = '' } = useParams();
  useDocumentTitle(username);

  const query = useQuery({
    queryKey: qk.users.profile(username),
    queryFn: ({ signal }) =>
      api.get('/users/' + encodeURIComponent(username), { schema: ProfileSchema, signal }),
    enabled: username !== '',
  });

  if (query.isPending) return <ProfileSkeleton />;

  if (isApiError(query.error) && query.error.status === 404) {
    return (
      <div className={FRAME}>
        <EmptyState
          icon={<UserX />}
          title="No such user"
          description={
            'We could not find anyone called "' +
            username +
            '". Check the spelling or browse the leaderboard.'
          }
          action={<ButtonLink to="/leaderboard">Open the leaderboard</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className={FRAME}>
      <QueryState query={query} errorTitle="Could not load this profile">
        {(profile) => (
          <>
            <ProfileHeader profile={profile} />
            <StatCards profile={profile} />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
              <DifficultyBars stats={profile.stats} />
              <LanguageBreakdown stats={profile.stats} />
              <RecentAccepted items={profile.recentAccepted} />
            </div>
            <Card>
              <CardHeader
                title="Activity"
                description="Submissions per day over the last 365 days (UTC)."
              />
              <div className="p-5 pt-3">
                <Heatmap days={profile.heatmap} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Rating history" description="Rating after each rated contest." />
              <div className="p-5 pt-3">
                {profile.ratingHistory.length === 0 ? (
                  <EmptyState
                    compact
                    title="No rated contests yet"
                    description="The rating chart appears after the first rated contest."
                  />
                ) : (
                  <RatingChart history={profile.ratingHistory} />
                )}
              </div>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}

export default Component;
