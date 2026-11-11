import type { ContestProblemItem } from '@arbiter/shared';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { Link } from 'react-router';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { formatNumber, formatPercent } from '@/lib/format';

function StatusIcon({ status }: { status: ContestProblemItem['userStatus'] }) {
  if (status === 'SOLVED') {
    return (
      <span role="img" aria-label="Solved" title="Solved" className="inline-flex">
        <CircleCheck aria-hidden="true" className="size-4 text-verdict-ac" />
      </span>
    );
  }
  if (status === 'ATTEMPTED') {
    return (
      <span role="img" aria-label="Attempted" title="Attempted" className="inline-flex">
        <CircleDashed aria-hidden="true" className="size-4 text-verdict-tle" />
      </span>
    );
  }
  return <span aria-hidden="true" className="inline-flex size-4" />;
}

export interface ContestProblemsTableProps {
  slug: string;
  problems: ContestProblemItem[];
}

/** Problems tab: label, title, solved / attempted counts and the user's own status. */
export function ContestProblemsTable({ slug, problems }: ContestProblemsTableProps) {
  const base = `/contests/${encodeURIComponent(slug)}/problems`;
  return (
    <Table>
      <THead>
        <Tr>
          <Th className="w-10">
            <span className="sr-only">My status</span>
          </Th>
          <Th className="w-14">#</Th>
          <Th>Problem</Th>
          <Th numeric>Solved by</Th>
          <Th numeric className="hidden sm:table-cell">
            Tried by
          </Th>
          <Th numeric className="hidden sm:table-cell">
            Success
          </Th>
        </Tr>
      </THead>
      <TBody>
        {problems.map((p) => (
          <Tr key={p.label} interactive>
            <Td>
              <StatusIcon status={p.userStatus} />
            </Td>
            <Td className="font-mono font-semibold text-foreground">{p.label}</Td>
            <Td>
              <Link
                to={`${base}/${encodeURIComponent(p.label)}`}
                className="font-medium text-foreground hover:text-primary-text hover:underline hover:underline-offset-2"
              >
                {p.title}
              </Link>
            </Td>
            <Td numeric>{formatNumber(p.solvedCount)}</Td>
            <Td numeric muted className="hidden sm:table-cell">
              {formatNumber(p.attemptedCount)}
            </Td>
            <Td numeric muted className="hidden sm:table-cell">
              {p.attemptedCount > 0 ? formatPercent(p.solvedCount / p.attemptedCount, 0) : '–'}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
