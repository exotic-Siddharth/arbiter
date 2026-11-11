import { AdminTestListSchema, type AdminTestCaseSummary } from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  IconButton,
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
import { formatBytes, pluralize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { BulkUploadDialog } from './BulkUploadDialog';
import { TestEditDialog } from './TestEditDialog';

function Preview({ text, bytes }: { text: string; bytes: number }) {
  const shown = text.replace(/\n/g, '↵');
  return (
    <div className="max-w-[16rem]">
      <code className="block truncate font-mono text-xs text-foreground" title={text}>
        {shown || <span className="text-muted">(empty)</span>}
      </code>
      <span className="font-mono text-[11px] text-muted">{formatBytes(bytes)}</span>
    </div>
  );
}

/** Tests tab: list with previews, view/edit/delete one, add, bulk upload. */
export function ProblemTestsTab({ problemId }: { problemId: string }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AdminTestCaseSummary | 'new' | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminTestCaseSummary | null>(null);

  const tests = useQuery({
    queryKey: qk.admin.problems.tests(problemId),
    queryFn: ({ signal }) =>
      api.get(`/admin/problems/${problemId}/tests`, { schema: AdminTestListSchema, signal }),
  });

  const remove = useMutation({
    mutationFn: (test: AdminTestCaseSummary) =>
      api.delete<void>(`/admin/problems/${problemId}/tests/${test.id}`),
    onSuccess: (_data, test) => {
      toast.success(`Deleted test ${test.ordinal}`);
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.tests(problemId) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.detail(problemId) });
    },
    onError: (error) => toastError(error, 'Could not delete the test'),
  });

  const count = tests.data?.length ?? 0;
  const samples = tests.data?.filter((test) => test.isSample).length ?? 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Test cases"
        description={
          tests.data
            ? `${pluralize(count, 'test')}, ${samples} marked as sample. Tests run in this order.`
            : 'Loading tests'
        }
        divider
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Upload />}
              onClick={() => setBulkOpen(true)}
            >
              Bulk upload
            </Button>
            <Button size="sm" leftIcon={<Plus />} onClick={() => setTarget('new')}>
              Add test
            </Button>
          </>
        }
      />
      <QueryState
        query={tests}
        loading={<TableSkeleton rows={5} columns={5} />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={<FlaskConical />}
            title="No tests yet"
            description="Add the samples first, then bulk upload the remaining .in/.out pairs."
            action={
              <Button leftIcon={<Upload />} onClick={() => setBulkOpen(true)}>
                Bulk upload
              </Button>
            }
          />
        }
      >
        {(data) => (
          <Table aria-label="Test cases">
            <THead>
              <Tr>
                <Th numeric className="w-14">
                  #
                </Th>
                <Th>Input</Th>
                <Th>Expected output</Th>
                <Th>Type</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {data.map((test) => (
                <Tr key={test.id} interactive>
                  <Td numeric muted>
                    {test.ordinal}
                  </Td>
                  <Td>
                    <Preview text={test.inputPreview} bytes={test.inputBytes} />
                  </Td>
                  <Td>
                    <Preview text={test.expectedOutputPreview} bytes={test.expectedOutputBytes} />
                  </Td>
                  <Td>
                    {test.isSample ? (
                      <Badge tone="info" size="sm">
                        Sample
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">Hidden</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-0.5">
                      <IconButton
                        label={`View or edit test ${test.ordinal}`}
                        icon={<Pencil />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setTarget(test)}
                      />
                      <IconButton
                        label={`Delete test ${test.ordinal}`}
                        icon={<Trash2 />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(test)}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </QueryState>

      <TestEditDialog problemId={problemId} target={target} onClose={() => setTarget(null)} />
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        problemId={problemId}
        existingCount={count}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete test ${pendingDelete?.ordinal ?? ''}?`}
        description="Later tests move up by one. Submissions already judged keep their results."
        confirmLabel="Delete test"
        tone="danger"
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete);
        }}
      />
    </Card>
  );
}
