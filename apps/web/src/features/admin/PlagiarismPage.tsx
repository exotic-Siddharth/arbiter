import { AdminContestPageSchema, PlagiarismReportListSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { ScanSearch } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Page } from '@/components/layout/Page';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  QueryState,
  Select,
  TBody,
  THead,
  Table,
  TableSkeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { REPORT_STATUS } from './lib/reportStatus';

/** /admin/plagiarism: reports, newest first, optionally for one contest. */
export function Component() {
  const [params, setParams] = useSearchParams();
  const contestId = params.get('contestId') ?? '';
  const query = { contestId: contestId || undefined };

  const contests = useQuery({
    queryKey: qk.admin.contests.list({ page: 1, pageSize: 100 }),
    queryFn: ({ signal }) =>
      api.get('/admin/contests', {
        query: { page: 1, pageSize: 100 },
        schema: AdminContestPageSchema,
        signal,
      }),
  });
  const reports = useQuery({
    queryKey: qk.admin.plagiarism.list(query),
    queryFn: ({ signal }) =>
      api.get('/admin/plagiarism', { query, schema: PlagiarismReportListSchema, signal }),
    // Reports are built by a background job: follow the unfinished ones.
    refetchInterval: (q) =>
      q.state.data?.some((report) => report.status === 'PENDING' || report.status === 'RUNNING')
        ? 3000
        : false,
  });

  return (
    <Page
      title="Plagiarism"
      documentTitle="Admin · Plagiarism"
      description="Winnowing-based similarity reports. Start a check from a contest's page."
    >
      <div className="space-y-4">
        <Select
          label="Contest"
          placeholder="All contests"
          value={contestId}
          containerClassName="max-w-sm"
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('contestId', event.target.value);
            else next.delete('contestId');
            setParams(next, { replace: true });
          }}
          options={(contests.data?.items ?? []).map((contest) => ({
            value: contest.id,
            label: contest.title,
          }))}
        />
        <Card className="overflow-hidden">
          <QueryState
            query={reports}
            loading={<TableSkeleton rows={5} columns={6} />}
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState
                icon={<ScanSearch />}
                title="No reports yet"
                description="Open a contest and run a plagiarism check after it ends."
                action={
                  <ButtonLink to="/admin/contests" variant="secondary">
                    Go to contests
                  </ButtonLink>
                }
              />
            }
          >
            {(data) => (
              <Table aria-label="Plagiarism reports">
                <THead>
                  <Tr>
                    <Th>Contest</Th>
                    <Th>Status</Th>
                    <Th numeric>Threshold</Th>
                    <Th numeric>Pairs</Th>
                    <Th>Created</Th>
                    <Th className="w-20">
                      <span className="sr-only">Open</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.map((report) => {
                    const status = REPORT_STATUS[report.status];
                    return (
                      <Tr key={report.id} interactive>
                        <Td className="max-w-[20rem]">
                          <Link
                            to={`/admin/plagiarism/${report.id}`}
                            className="block truncate font-medium hover:text-primary-text"
                          >
                            {report.contestTitle ?? 'Deleted contest'}
                          </Link>
                          <span className="block text-xs text-muted">
                            {report.problemId ? 'One problem' : 'All problems'}
                          </span>
                        </Td>
                        <Td>
                          <Badge
                            tone={status.tone}
                            size="sm"
                            dot={
                              report.status === 'RUNNING' || report.status === 'PENDING'
                                ? 'pulse'
                                : false
                            }
                          >
                            {status.label}
                          </Badge>
                        </Td>
                        <Td numeric>{Math.round(report.threshold * 100)}%</Td>
                        <Td numeric>
                          {report.status === 'DONE' ? formatNumber(report.pairCount) : '-'}
                        </Td>
                        <Td
                          muted
                          className="whitespace-nowrap"
                          title={formatDateTime(report.createdAt)}
                        >
                          {formatRelativeTime(report.createdAt)}
                        </Td>
                        <Td>
                          <Link
                            to={`/admin/plagiarism/${report.id}`}
                            aria-label={`Open report for ${report.contestTitle ?? 'a deleted contest'}`}
                            className="text-sm font-medium text-primary-text hover:underline"
                          >
                            Open
                          </Link>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>
      </div>
    </Page>
  );
}

export default Component;
