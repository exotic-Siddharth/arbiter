import { AdminProblemPageSchema, type AdminProblemSummary } from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { DifficultyBadge } from '@/components';
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
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { useClampPage } from '@/lib/useClampPage';
import { useListParams } from './hooks/useListParams';

const PAGE_SIZE = 20;

/** /admin/problems: every problem, published or not (spec 13.2). */
export function Component() {
  const { page, setPage, search, text, setText } = useListParams();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<AdminProblemSummary | null>(null);
  const query = { search: search || undefined, page, pageSize: PAGE_SIZE };

  const problems = useQuery({
    queryKey: qk.admin.problems.list(query),
    queryFn: ({ signal }) =>
      api.get('/admin/problems', { query, schema: AdminProblemPageSchema, signal }),
    placeholderData: (previous) => previous,
  });
  useClampPage(problems.data, problems.isPlaceholderData, setPage);

  const remove = useMutation({
    mutationFn: (problem: AdminProblemSummary) => api.delete<void>(`/admin/problems/${problem.id}`),
    onSuccess: (_data, problem) => {
      toast.success(`Deleted ${problem.title}`);
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
    },
    onError: (error) => toastError(error, 'Could not delete the problem'),
  });

  return (
    <Page
      title="Problems"
      documentTitle="Admin · Problems"
      description="Statements, test data and reference solutions. Unpublished problems are visible here only."
      actions={
        <ButtonLink to="/admin/problems/new" leftIcon={<Plus />}>
          New problem
        </ButtonLink>
      }
    >
      <div className="space-y-4">
        <Input
          aria-label="Search problems"
          placeholder="Search by title or slug"
          leftIcon={<Search />}
          value={text}
          onChange={(event) => setText(event.target.value)}
          containerClassName="max-w-sm"
        />
        <Card className="overflow-hidden">
          <QueryState
            query={problems}
            loading={<TableSkeleton rows={8} columns={6} />}
            isEmpty={(data) => data.items.length === 0 && data.total === 0}
            empty={
              <EmptyState
                icon={<FileCode />}
                title={search ? 'No problems match your search' : 'No problems yet'}
                description={
                  search
                    ? 'Try a different title or slug.'
                    : 'Create the first problem, add tests, then publish it.'
                }
                action={
                  search ? undefined : (
                    <ButtonLink to="/admin/problems/new" leftIcon={<Plus />}>
                      New problem
                    </ButtonLink>
                  )
                }
              />
            }
          >
            {(data) => (
              <Table aria-label="Problems">
                <THead>
                  <Tr>
                    <Th>Problem</Th>
                    <Th>Difficulty</Th>
                    <Th>Status</Th>
                    <Th numeric>Tests</Th>
                    <Th numeric>Accepted</Th>
                    <Th>Updated</Th>
                    <Th className="w-12">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.items.map((problem) => (
                    <Tr key={problem.id} interactive>
                      <Td className="max-w-[22rem]">
                        <Link
                          to={`/admin/problems/${problem.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary-text"
                        >
                          {problem.title}
                        </Link>
                        <span className="block truncate font-mono text-xs text-muted">
                          {problem.slug}
                        </span>
                      </Td>
                      <Td>
                        <DifficultyBadge difficulty={problem.difficulty} variant="text" />
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={problem.isPublished ? 'success' : 'neutral'} size="sm">
                            {problem.isPublished ? 'Published' : 'Draft'}
                          </Badge>
                          {problem.hasReference ? null : (
                            <Badge tone="warning" size="sm">
                              No reference
                            </Badge>
                          )}
                        </div>
                      </Td>
                      <Td numeric>{formatNumber(problem.testCount)}</Td>
                      <Td numeric>
                        {formatNumber(problem.acceptedCount)}
                        <span className="text-muted">
                          {' '}
                          / {formatNumber(problem.submissionCount)}
                        </span>
                      </Td>
                      <Td muted className="whitespace-nowrap">
                        {formatRelativeTime(problem.updatedAt)}
                      </Td>
                      <Td>
                        <IconButton
                          label={`Delete ${problem.title}`}
                          icon={<Trash2 />}
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(problem)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>
        {problems.data && problems.data.total > 0 ? (
          <Pagination
            page={problems.data.page}
            pageSize={problems.data.pageSize}
            total={problems.data.total}
            onPageChange={setPage}
            itemLabel="problems"
          />
        ) : null}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.title ?? 'problem'}?`}
        description="This permanently removes the problem and its tests. It cannot be undone."
        confirmLabel="Delete problem"
        tone="danger"
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete);
        }}
      />
    </Page>
  );
}

export default Component;
