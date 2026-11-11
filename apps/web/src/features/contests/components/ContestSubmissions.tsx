import { SubmissionPageSchema, type SubmissionStatus } from '@arbiter/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { TimeAgo, VerdictBadge } from '@/components';
import {
  EmptyState,
  Pagination,
  QueryState,
  TBody,
  THead,
  Table,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatMemoryKb, formatMs, languageLabel } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { useSocketEvent } from '@/lib/socket';

const PAGE_SIZE = 20;
const isPending = (status: SubmissionStatus) =>
  status === 'QUEUED' || status === 'COMPILING' || status === 'RUNNING';

/**
 * My submissions tab: GET /api/contests/:slug/submissions?mine=true. The owner's
 * `submission:done` events (user room) refresh the list; pending rows also poll gently.
 */
export function ContestSubmissions({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const params = { mine: 'true', page, pageSize: PAGE_SIZE };
  const query = useQuery({
    queryKey: qk.contests.submissions(slug, params),
    queryFn: ({ signal }) =>
      api.get(`/contests/${encodeURIComponent(slug)}/submissions`, {
        query: params,
        schema: SubmissionPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((s) => isPending(s.status)) ? 5000 : false),
  });

  useSocketEvent('submission:done', (event) => {
    if (query.data?.items.some((s) => s.id === event.id)) {
      void queryClient.invalidateQueries({ queryKey: qk.contests.submissions(slug) });
    }
  });

  return (
    <QueryState
      query={query}
      loading={<TableSkeleton rows={4} columns={5} />}
      isEmpty={(data) => data.total === 0}
      empty={
        <EmptyState
          icon={<Inbox />}
          title="No submissions yet"
          description="Open a problem from the Problems tab and submit a solution."
        />
      }
    >
      {(data) => (
        <div>
          <Table>
            <THead>
              <Tr>
                <Th>When</Th>
                <Th>Problem</Th>
                <Th>Verdict</Th>
                <Th className="hidden sm:table-cell">Language</Th>
                <Th numeric className="hidden sm:table-cell">
                  Time
                </Th>
                <Th numeric className="hidden md:table-cell">
                  Memory
                </Th>
              </Tr>
            </THead>
            <TBody>
              {data.items.map((s) => (
                <Tr key={s.id} interactive>
                  <Td muted>
                    <Link
                      to={`/submissions/${encodeURIComponent(s.id)}`}
                      className="hover:text-foreground hover:underline hover:underline-offset-2"
                    >
                      <TimeAgo date={s.createdAt} />
                    </Link>
                  </Td>
                  <Td className="max-w-56 truncate font-medium text-foreground">
                    {s.problem.title}
                  </Td>
                  <Td>
                    <VerdictBadge
                      verdict={s.verdict}
                      status={s.status}
                      size="sm"
                      testsDone={s.testsPassed}
                      testsTotal={s.testsTotal}
                    />
                  </Td>
                  <Td muted className="hidden sm:table-cell">
                    {languageLabel(s.language)}
                  </Td>
                  <Td numeric muted className="hidden sm:table-cell">
                    {formatMs(s.timeMs)}
                  </Td>
                  <Td numeric muted className="hidden md:table-cell">
                    {formatMemoryKb(s.memoryKb)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {data.total > PAGE_SIZE ? (
            <div className="border-t border-border px-4 py-3">
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
                itemLabel="submissions"
              />
            </div>
          ) : null}
        </div>
      )}
    </QueryState>
  );
}
