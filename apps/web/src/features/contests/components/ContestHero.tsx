import type { ContestDetail } from '@arbiter/shared';
import { Countdown } from '@/components';
import { Card, ProgressBar } from '@/components/ui';
import { formatDateTime, formatDuration, formatNumber, pluralize } from '@/lib/format';
import { contestElapsed, contestLength, type ContestBoundary } from '../lib/contestClock';
import { ContestStatusBadge } from './ContestStatusBadge';

export interface ContestHeroProps {
  contest: ContestDetail;
  boundary: ContestBoundary;
  offsetMs: number;
  onBoundary: () => void;
  /** Client ms the boundary was evaluated at (for the elapsed bar). */
  evaluatedAt: number;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words text-foreground">{children}</dd>
    </div>
  );
}

/** Contest header card: status, the server-corrected countdown and the schedule facts. */
export function ContestHero({
  contest,
  boundary,
  offsetMs,
  onBoundary,
  evaluatedAt,
}: ContestHeroProps) {
  const elapsed = contestElapsed(contest, evaluatedAt + offsetMs);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-6 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Fact label="Starts">{formatDateTime(contest.startsAt)}</Fact>
          <Fact label="Length">{formatDuration(contestLength(contest))}</Fact>
          <Fact label="Penalty">{pluralize(contest.penaltyMinutes, 'min')} per wrong try</Fact>
          <Fact label="Registered">
            <span className="font-mono tabular-nums">{formatNumber(contest.participantCount)}</span>
          </Fact>
        </dl>
        <div className="flex items-center gap-4 border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted">
              <ContestStatusBadge status={boundary.phase} />
              {boundary.target ? boundary.label : `Ended ${formatDateTime(contest.endsAt)}`}
            </div>
            {boundary.target ? (
              <Countdown
                to={boundary.target}
                serverOffsetMs={offsetMs}
                onComplete={onBoundary}
                label={boundary.spoken}
                className="mt-1 block text-3xl font-semibold tracking-tight text-foreground"
              />
            ) : (
              <div className="mt-1 text-3xl font-semibold tracking-tight text-muted">Final</div>
            )}
          </div>
        </div>
      </div>
      {boundary.phase === 'RUNNING' ? (
        <ProgressBar
          value={Math.round(elapsed * 1000)}
          max={1000}
          label="Contest time elapsed"
          valueText={`${Math.round(elapsed * 100)}% of the contest elapsed`}
          size="xs"
          className="rounded-none"
        />
      ) : null}
    </Card>
  );
}
