import type { SubmissionTestResult } from '@arbiter/shared';
import { VerdictBadge } from '@/components';
import { Badge, TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { formatMemoryKb, formatMs } from '@/lib/format';

export interface TestResultsTableProps {
  results: readonly SubmissionTestResult[];
}

/** Per-test results of a submission (hidden tests show only verdict, time and memory). */
export function TestResultsTable({ results }: TestResultsTableProps) {
  const sorted = [...results].sort((a, b) => a.ordinal - b.ordinal);
  return (
    <Table aria-label="Test results">
      <THead>
        <Tr>
          <Th numeric className="w-16">
            #
          </Th>
          <Th>Verdict</Th>
          <Th numeric className="w-32">
            Time
          </Th>
          <Th numeric className="w-32">
            Memory
          </Th>
          <Th className="hidden w-28 pl-8 sm:table-cell">Kind</Th>
        </Tr>
      </THead>
      <TBody>
        {sorted.map((result) => (
          <Tr key={result.ordinal}>
            <Td numeric muted className="w-16">
              {result.ordinal}
            </Td>
            <Td>
              <VerdictBadge verdict={result.verdict} size="sm" />
            </Td>
            <Td numeric>{formatMs(result.timeMs)}</Td>
            <Td numeric>{formatMemoryKb(result.memoryKb)}</Td>
            <Td className="hidden pl-8 sm:table-cell">
              {result.isSample ? (
                <Badge size="sm" tone="accent">
                  sample
                </Badge>
              ) : (
                <span className="text-xs text-muted">hidden</span>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
