import type { ProblemSummary, UserProblemStatus } from '@arbiter/shared';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { Link } from 'react-router';
import { DifficultyBadge } from '@/components';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';

export function ProblemStatusIcon({
  status,
  className,
}: {
  status: UserProblemStatus | null;
  className?: string;
}) {
  if (status === 'SOLVED') {
    return (
      <span role="img" aria-label="Solved" title="Solved" className={cn('inline-flex', className)}>
        <CircleCheck aria-hidden="true" className="size-4 text-verdict-ac" />
      </span>
    );
  }
  if (status === 'ATTEMPTED') {
    return (
      <span
        role="img"
        aria-label="Attempted"
        title="Attempted"
        className={cn('inline-flex', className)}
      >
        <CircleDashed aria-hidden="true" className="size-4 text-verdict-tle" />
      </span>
    );
  }
  return <span aria-hidden="true" className={cn('inline-flex size-4', className)} />;
}

export interface TagChipProps {
  tag: string;
  active?: boolean;
  onSelect?: (tag: string) => void;
}

export function TagChip({ tag, active = false, onSelect }: TagChipProps) {
  const className = cn(
    'inline-flex h-6 items-center rounded-md border px-2 font-mono text-[11px] whitespace-nowrap transition-colors',
    active
      ? 'border-primary/50 bg-primary-soft text-primary-text'
      : 'border-border bg-raised/60 text-muted',
  );
  if (!onSelect) return <span className={className}>{tag}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(tag)}
      aria-pressed={active}
      aria-label={`Filter by tag ${tag}`}
      className={cn(
        className,
        'hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      {tag}
    </button>
  );
}

function AcceptanceCell({ problem }: { problem: ProblemSummary }) {
  if (problem.submissionCount === 0) return <span className="text-muted">—</span>;
  return <span>{formatPercent(problem.acceptanceRate)}</span>;
}

export interface ProblemTableProps {
  problems: readonly ProblemSummary[];
  /** Show the solved/attempted column (signed-in users). */
  showStatus: boolean;
  activeTag?: string;
  onTagSelect?: (tag: string) => void;
}

/** Problem list table: status, title, tags, difficulty, acceptance and submissions. */
export function ProblemTable({ problems, showStatus, activeTag, onTagSelect }: ProblemTableProps) {
  return (
    <Table aria-label="Problems">
      <THead>
        <Tr>
          {showStatus ? (
            <Th className="w-10 pr-0">
              <span className="sr-only">Status</span>
            </Th>
          ) : null}
          <Th>Title</Th>
          <Th className="hidden md:table-cell">Tags</Th>
          <Th className="hidden sm:table-cell">Difficulty</Th>
          <Th numeric>Acceptance</Th>
          <Th numeric className="hidden sm:table-cell">
            Submissions
          </Th>
        </Tr>
      </THead>
      <TBody>
        {problems.map((problem) => (
          <Tr key={problem.slug} interactive>
            {showStatus ? (
              <Td className="w-10 pr-0">
                <ProblemStatusIcon status={problem.userStatus} />
              </Td>
            ) : null}
            <Td className="max-w-0 min-w-44 sm:min-w-56">
              <Link
                to={`/problems/${problem.slug}`}
                className="block truncate rounded-sm font-medium text-foreground hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {problem.title}
              </Link>
              <div className="mt-1 flex items-center gap-2 sm:hidden">
                <DifficultyBadge difficulty={problem.difficulty} variant="text" />
                <span className="text-xs text-muted tabular-nums">
                  {formatNumber(problem.submissionCount)} submissions
                </span>
              </div>
            </Td>
            <Td className="hidden md:table-cell">
              <div className="flex max-w-72 flex-wrap gap-1">
                {problem.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} active={tag === activeTag} onSelect={onTagSelect} />
                ))}
              </div>
            </Td>
            <Td className="hidden sm:table-cell">
              <DifficultyBadge difficulty={problem.difficulty} size="sm" />
            </Td>
            <Td numeric>
              <AcceptanceCell problem={problem} />
            </Td>
            <Td numeric muted className="hidden sm:table-cell">
              {formatNumber(problem.submissionCount)}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
