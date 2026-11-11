import type { SubmissionSummary } from '@arbiter/shared';
import { Link } from 'react-router';
import { TimeAgo, UserLink, VerdictBadge } from '@/components';
import { Badge, TBody, THead, Table, Td, Th, Tr } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMemoryKb, formatMs, languageLabel } from '@/lib/format';
import { useRoom } from '@/lib/socket';

/** Joins the room of one of the viewer's own pending submissions (live status and tests). */
function SubmissionRoom({ id }: { id: string }) {
  useRoom('submission:subscribe', { id });
  return null;
}

export interface SubmissionsTableProps {
  submissions: readonly SubmissionSummary[];
  /** Signed-in username: their pending rows join the submission room for live updates. */
  viewer: string | null;
  testsDone?: Record<string, number>;
  justFinished?: ReadonlySet<string>;
}

/** Submission list: when, user, problem, language, verdict, time and memory. */
export function SubmissionsTable({
  submissions,
  viewer,
  testsDone = {},
  justFinished,
}: SubmissionsTableProps) {
  return (
    <Table
      className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2 max-sm:[&_td:first-child]:pl-3 max-sm:[&_th:first-child]:pl-3 max-sm:[&_td:last-child]:pr-3 max-sm:[&_th:last-child]:pr-3"
      aria-label="Submissions"
    >
      <THead>
        <Tr>
          <Th>When</Th>
          <Th className="hidden md:table-cell">User</Th>
          <Th>Problem</Th>
          <Th className="hidden lg:table-cell">Language</Th>
          <Th>Verdict</Th>
          <Th numeric className="hidden sm:table-cell">
            Time
          </Th>
          <Th numeric className="hidden sm:table-cell">
            Memory
          </Th>
        </Tr>
      </THead>
      <TBody>
        {submissions.map((submission) => {
          const own = viewer !== null && submission.user.username === viewer;
          const pending = ['QUEUED', 'COMPILING', 'RUNNING'].includes(submission.status);
          return (
            <Tr
              key={submission.id}
              interactive
              className={cn(justFinished?.has(submission.id) && 'animate-highlight')}
            >
              <Td className="sm:whitespace-nowrap">
                {own && pending ? <SubmissionRoom id={submission.id} /> : null}
                <Link
                  to={`/submissions/${submission.id}`}
                  className="rounded-sm text-[13px] text-foreground hover:text-primary-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Submission ${submission.id}, ${new Date(submission.createdAt).toLocaleString()}`}
                >
                  <TimeAgo date={submission.createdAt} />
                </Link>
              </Td>
              <Td className="hidden md:table-cell">
                <UserLink username={submission.user.username} />
              </Td>
              <Td className="max-w-0 min-w-24 sm:min-w-32">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/problems/${submission.problem.slug}`}
                    className="rounded-sm font-medium text-foreground hover:text-primary-text sm:truncate focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {submission.problem.title}
                  </Link>
                  {submission.contestSlug ? (
                    <Badge size="sm" tone="primary" title={`Contest: ${submission.contestSlug}`}>
                      contest
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted md:hidden">
                  {submission.user.username} · {languageLabel(submission.language)}
                </div>
              </Td>
              <Td muted className="hidden whitespace-nowrap lg:table-cell">
                {languageLabel(submission.language)}
              </Td>
              <Td className="whitespace-nowrap">
                <VerdictBadge
                  verdict={submission.verdict}
                  status={submission.status}
                  testsDone={testsDone[submission.id] ?? 0}
                  testsTotal={submission.testsTotal}
                  size="sm"
                />
              </Td>
              <Td numeric muted className="hidden sm:table-cell">
                {formatMs(submission.timeMs)}
              </Td>
              <Td numeric muted className="hidden sm:table-cell">
                {formatMemoryKb(submission.memoryKb)}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
