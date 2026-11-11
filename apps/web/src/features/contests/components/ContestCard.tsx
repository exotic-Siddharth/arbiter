import type { ContestSummary } from '@arbiter/shared';
import { CalendarClock, Hourglass, ListChecks, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Countdown } from '@/components';
import { Badge, Card } from '@/components/ui';
import { formatDateTime, formatDuration, formatNumber, pluralize } from '@/lib/format';
import { contestBoundary, contestLength } from '../lib/contestClock';
import { ContestStatusBadge } from './ContestStatusBadge';
import { RegisterButton } from './RegisterButton';

export interface ContestCardProps {
  contest: ContestSummary;
  /** Client time the list was evaluated at (Date.now() at fetch). */
  now: number;
  onBoundary?: () => void;
}

/** One contest in the /contests list: status, schedule, countdown, participants, register. */
export function ContestCard({ contest, now, onBoundary }: ContestCardProps) {
  const boundary = contestBoundary(contest, now);
  const href = `/contests/${encodeURIComponent(contest.slug)}`;
  return (
    <Card className="flex flex-col gap-4 p-5 transition-colors hover:border-border-strong sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ContestStatusBadge status={contest.status} />
          {contest.rated ? (
            <Badge tone="primary" size="sm" variant="outline">
              Rated
            </Badge>
          ) : null}
        </div>
        <h3 className="text-base font-semibold leading-snug text-foreground">
          <Link
            to={href}
            className="rounded-sm hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {contest.title}
          </Link>
        </h3>
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Starts</dt>
            <CalendarClock aria-hidden="true" className="size-3.5" />
            <dd>{formatDateTime(contest.startsAt)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Length</dt>
            <Hourglass aria-hidden="true" className="size-3.5" />
            <dd>{formatDuration(contestLength(contest))}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Problems</dt>
            <ListChecks aria-hidden="true" className="size-3.5" />
            <dd>{pluralize(contest.problemCount, 'problem')}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Participants</dt>
            <Users aria-hidden="true" className="size-3.5" />
            <dd>
              <span className="font-mono tabular-nums">
                {formatNumber(contest.participantCount)}
              </span>{' '}
              registered
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border pt-4 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        {boundary.target ? (
          <div className="text-left sm:text-right">
            <div className="text-xs text-muted">{boundary.label}</div>
            <Countdown
              to={boundary.target}
              label={boundary.spoken}
              onComplete={onBoundary}
              className="text-lg font-semibold text-foreground"
            />
          </div>
        ) : (
          <div className="text-left text-xs text-muted sm:text-right">
            Ended {formatDateTime(contest.endsAt)}
          </div>
        )}
        <RegisterButton contest={contest} size="sm" />
      </div>
    </Card>
  );
}
