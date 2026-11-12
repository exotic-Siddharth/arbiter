import { AdminContestPageSchema, type AdminContestSummary } from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Page } from '@/components/layout/Page';
import {
  Badge,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
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
import { formatDateTime, formatNumber } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { useClampPage } from '@/lib/useClampPage';
import { ContestStatusBadge } from '@/features/contests/components/ContestStatusBadge';
import { useListParams } from './hooks/useListParams';

const PAGE_SIZE = 20;

/** /admin/contests: every contest, published or not (spec 13.2). */
export function Component() {
  const { page, setPage, search, text, setText } = useListParams();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<AdminContestSummary | null>(null);
  const query = { search: search || undefined, page, pageSize: PAGE_SIZE };

  const contests = useQuery({
    queryKey: qk.admin.contests.list(query),
    queryFn: ({ signal }) =>
      api.get('/admin/contests', { query, schema: AdminContestPageSchema, signal }),
    placeholderData: (previous) => previous,
  });
  useClampPage(contests.data, contests.isPlaceholderData, setPage);

  const remove = useMutation({
    mutationFn: (contest: AdminContestSummary) => api.delete<void>(`/admin/contests/${contest.id}`),
    onSuccess: (_data, contest) => {
      toast.success(`Deleted ${contest.title}`);
      void queryClient.invalidateQueries({ queryKey: qk.admin.contests.all });
      void queryClient.invalidateQueries({ queryKey: qk.contests.all });
    },
    onError: (error) => toastError(error, 'Could not delete the contest'),
  });

  return (
    <Page
      title="Contests"
      documentTitle="Admin · Contests"
      description="Schedule contests, pick problems, then apply ratings and run plagiarism checks after the end."
      actions={
        <ButtonLink to="/admin/contests/new" leftIcon={<Plus />}>
          New contest
        </ButtonLink>
      }
    >
      <div className="space-y-4">
        <Input
          aria-label="Search contests"
          placeholder="Search by title or slug"
          leftIcon={<Search />}
          value={text}
          onChange={(event) => setText(event.target.value)}
          containerClassName="max-w-sm"
        />
        <Card className="overflow-hidden">
          <QueryState
            query={contests}
            loading={<TableSkeleton rows={6} columns={6} />}
            isEmpty={(data) => data.items.length === 0 && data.total === 0}
            empty={
              <EmptyState
                icon={<Trophy />}
                title={search ? 'No contests match your search' : 'No contests yet'}
                description={
                  search
                    ? 'Try a different title or slug.'
                    : 'Schedule the first round and pick its problems.'
                }
                action={
                  search ? undefined : (
                    <ButtonLink to="/admin/contests/new" leftIcon={<Plus />}>
                      New contest
                    </ButtonLink>
                  )
                }
              />
            }
          >
            {(data) => (
              <Table aria-label="Contests">
                <THead>
                  <Tr>
                    <Th>Contest</Th>
                    <Th>Status</Th>
                    <Th>Starts</Th>
                    <Th numeric>Problems</Th>
                    <Th numeric>Participants</Th>
                    <Th>Ratings</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.items.map((contest) => (
                    <Tr key={contest.id} interactive>
                      <Td className="max-w-[20rem]">
                        <Link
                          to={`/admin/contests/${contest.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary-text"
                        >
                          {contest.title}
                        </Link>
                        <span className="block truncate font-mono text-xs text-muted">
                          {contest.slug}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <ContestStatusBadge status={contest.status} />
                          {contest.isPublished ? null : (
                            <Badge size="sm" tone="neutral">
                              Draft
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td muted className="whitespace-nowrap">
                        {formatDateTime(contest.startsAt)}
                      </Td>
                      <Td numeric>{formatNumber(contest.problemCount)}</Td>
                      <Td numeric>{formatNumber(contest.participantCount)}</Td>
                      <Td>
                        {contest.ratedAt ? (
                          <Badge tone="primary" size="sm" variant="outline">
                            Applied
                          </Badge>
                        ) : contest.status === 'ENDED' ? (
                          <Badge tone="warning" size="sm">
                            Pending
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </Td>
                      <Td>
                        <IconButton
                          label={`Delete ${contest.title}`}
                          icon={<Trash2 />}
                          variant="ghost"
                          size="sm"
                          disabled={contest.ratedAt !== null}
                          onClick={() => setPendingDelete(contest)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>
        {contests.data && contests.data.total > 0 ? (
          <Pagination
            page={contests.data.page}
            pageSize={contests.data.pageSize}
            total={contests.data.total}
            onPageChange={setPage}
            itemLabel="contests"
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.title ?? 'contest'}?`}
        description="This permanently removes the contest and its scoreboard. It cannot be undone."
        confirmLabel="Delete contest"
        tone="danger"
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete);
        }}
      />
    </Page>
  );
}

export default Component;
