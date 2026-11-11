import type { ContestDetail } from '@arbiter/shared';
import { ArrowLeft, Trophy } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Countdown } from '@/components';
import { Badge, ButtonLink } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ContestBarProps {
  contest: ContestDetail;
  /** Label of the open problem. */
  label: string;
  /** Server clock offset (computeServerOffset(contest.serverTime, dataUpdatedAt)). */
  serverOffsetMs: number;
  /** The countdown crossed zero (refetch the contest). */
  onPhaseChange: () => void;
}

const STATUS_BADGE = {
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  RUNNING: { label: 'Running', tone: 'success' },
  ENDED: { label: 'Ended', tone: 'neutral' },
} as const;

/** Contest-mode header: contest name, status, countdown and the A–E problem switcher. */
export function ContestBar({ contest, label, serverOffsetMs, onPhaseChange }: ContestBarProps) {
  const status = STATUS_BADGE[contest.status];
  const base = `/contests/${encodeURIComponent(contest.slug)}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={base}
          aria-label={`Back to ${contest.title}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Link>
        <Link
          to={base}
          className="truncate rounded-sm text-sm font-semibold text-foreground hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {contest.title}
        </Link>
        <Badge tone={status.tone} size="sm" dot={contest.status === 'RUNNING' ? 'pulse' : true}>
          {status.label}
        </Badge>
      </div>

      {contest.status !== 'ENDED' ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <span>{contest.status === 'RUNNING' ? 'Ends in' : 'Starts in'}</span>
          <Countdown
            to={contest.status === 'RUNNING' ? contest.endsAt : contest.startsAt}
            serverOffsetMs={serverOffsetMs}
            onComplete={onPhaseChange}
            label={contest.status === 'RUNNING' ? 'until the end' : 'until the start'}
            className="font-mono font-semibold text-foreground tabular-nums"
          />
        </div>
      ) : (
        <span className="text-[13px] text-muted">Submissions now count as practice.</span>
      )}

      <nav aria-label="Contest problems" className="flex items-center gap-1 sm:ml-auto">
        {(contest.problems ?? []).map((problem) => (
          <NavLink
            key={problem.label}
            to={`${base}/problems/${encodeURIComponent(problem.label)}`}
            aria-label={`Problem ${problem.label}: ${problem.title}${problem.userStatus === 'SOLVED' ? ' (solved)' : problem.userStatus === 'ATTEMPTED' ? ' (attempted)' : ''}`}
            title={problem.title}
            aria-current={problem.label === label ? 'page' : undefined}
            className={cn(
              'flex size-8 items-center justify-center rounded-control border font-mono text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              problem.label === label
                ? 'border-primary bg-primary-soft text-primary-text'
                : 'border-border text-muted hover:border-border-strong hover:text-foreground',
              problem.userStatus === 'SOLVED' &&
                problem.label !== label &&
                'border-verdict-ac/50 bg-verdict-ac/10 text-verdict-ac',
              problem.userStatus === 'ATTEMPTED' &&
                problem.label !== label &&
                'border-verdict-wa/40 text-verdict-wa',
            )}
          >
            {problem.label}
          </NavLink>
        ))}
        <ButtonLink
          to={`${base}/scoreboard`}
          variant="ghost"
          size="sm"
          leftIcon={<Trophy />}
          className="ml-1"
        >
          <span className="hidden sm:inline">Scoreboard</span>
          <span className="sr-only sm:hidden">Scoreboard</span>
        </ButtonLink>
      </nav>
    </div>
  );
}
