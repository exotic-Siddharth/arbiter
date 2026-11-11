import type { ContestSummary } from '@arbiter/shared';
import { ArrowRight, CalendarClock, Swords } from 'lucide-react';
import { Link } from 'react-router';
import { Countdown } from '@/components/Countdown';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime, pluralize } from '@/lib/format';
import { useContestList } from '@/features/contests/hooks/useContestList';

function useFeaturedContest() {
  const running = useContestList('running');
  const runningContest = running.data?.contests[0];
  const needUpcoming = running.isSuccess && runningContest === undefined;
  const upcoming = useContestList('upcoming', { enabled: needUpcoming });
  const next = upcoming.data?.contests
    .slice()
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];

  return {
    contest: runningContest ?? next,
    offsetMs: (runningContest ? running.data : upcoming.data)?.offsetMs ?? 0,
    isPending: running.isPending || (needUpcoming && upcoming.isPending),
    error: running.error ?? upcoming.error,
    isError: running.isError || (needUpcoming && upcoming.isError),
    isFetching: running.isFetching || upcoming.isFetching,
    refetch: () => Promise.all([running.refetch(), needUpcoming ? upcoming.refetch() : undefined]),
  };
}

function ContestBody({ contest, offsetMs }: { contest: ContestSummary; offsetMs: number }) {
  const live = contest.status === 'RUNNING';
  return (
    <div className="space-y-4 p-5 pt-3">
      <div className="space-y-2">
        <Badge tone={live ? 'success' : 'info'} dot={live ? 'pulse' : false} pill>
          {live ? 'Running now' : 'Starts soon'}
        </Badge>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          <Link
            to={'/contests/' + encodeURIComponent(contest.slug)}
            className="rounded-sm hover:underline"
          >
            {contest.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {pluralize(contest.problemCount, 'problem')} ·{' '}
          {pluralize(contest.participantCount, 'participant')}
          {contest.rated ? ' · rated' : ''}
        </p>
      </div>
      <div className="rounded-control border border-border bg-raised/60 px-4 py-3">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {live ? 'Ends in' : 'Starts in'}
        </p>
        <Countdown
          to={live ? contest.endsAt : contest.startsAt}
          serverOffsetMs={offsetMs}
          label={live ? 'until the contest ends' : 'until the contest starts'}
          className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums"
        />
        <p className="mt-1 text-xs text-muted">
          {live ? 'Ends' : 'Starts'} {formatDateTime(live ? contest.endsAt : contest.startsAt)}
        </p>
      </div>
      <ButtonLink
        to={'/contests/' + encodeURIComponent(contest.slug)}
        fullWidth
        variant={live ? 'primary' : 'secondary'}
        rightIcon={<ArrowRight />}
      >
        {contest.isRegistered ? 'Open contest' : live ? 'Join the contest' : 'View and register'}
      </ButtonLink>
    </div>
  );
}

/** The running contest, else the next upcoming one. */
export function FeaturedContest() {
  const featured = useFeaturedContest();
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Featured contest"
        description="ICPC-style scoring, live scoreboard."
        divider={false}
      />
      {featured.isPending ? (
        <div
          className="space-y-4 p-5 pt-3"
          role="status"
          aria-label="Loading featured contest"
          aria-busy="true"
        >
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : featured.isError ? (
        <ErrorState
          compact
          error={featured.error}
          title="Could not load contests"
          retrying={featured.isFetching}
          onRetry={() => void featured.refetch()}
        />
      ) : featured.contest ? (
        <ContestBody contest={featured.contest} offsetMs={featured.offsetMs} />
      ) : (
        <EmptyState
          compact
          icon={<CalendarClock />}
          title="No contest scheduled"
          description="The next round will show up here as soon as it is announced."
          action={
            <ButtonLink to="/contests" variant="outline" size="sm" leftIcon={<Swords />}>
              Past contests
            </ButtonLink>
          }
        />
      )}
    </Card>
  );
}
