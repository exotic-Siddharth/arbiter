import { BulkTestsResponseSchema, LIMITS } from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileUp, X } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Alert, Badge, Button, Dialog, Input, Switch } from '@/components/ui';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBytes, formatNumber, pluralize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { buildBulkBody } from '../lib/bulkTests';
import { pairTestFiles, type OrphanReason } from '../lib/pairTestFiles';

const ORPHAN_TEXT: Record<OrphanReason, string> = {
  'missing-output': 'No matching .out file',
  'missing-input': 'No matching .in file',
  duplicate: 'Another file already has this name',
};

export interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemId: string;
  /** Tests the problem has now (for the replace warning). */
  existingCount: number;
}

/**
 * Bulk upload: select many files at once, "01.in" + "01.out" become one test. Unpaired files
 * are listed instead of dropped silently. Replace deletes the existing tests first (the
 * server does it in the same request as the insert).
 */
export function BulkUploadDialog({
  open,
  onOpenChange,
  problemId,
  existingCount,
}: BulkUploadDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [replace, setReplace] = useState(false);
  const [sampleCount, setSampleCount] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const paired = useMemo(() => pairTestFiles(files), [files]);
  const samples = Math.min(Math.max(0, Number.parseInt(sampleCount, 10) || 0), paired.pairs.length);

  const reset = () => {
    setFiles([]);
    setReplace(false);
    setSampleCount('0');
    setError(null);
    setDragging(false);
  };

  const upload = useMutation({
    mutationFn: async () => {
      const built = await buildBulkBody(paired.pairs, { sampleCount: samples, replace });
      if (!built.ok) throw new Error(built.message);
      return api.post(`/admin/problems/${problemId}/tests/bulk`, built.body, {
        schema: BulkTestsResponseSchema,
      });
    },
    onSuccess: (result) => {
      toast.success(
        `Added ${pluralize(result.created, 'test')}; the problem now has ${formatNumber(result.total)}`,
      );
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.tests(problemId) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.detail(problemId) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
      reset();
      onOpenChange(false);
    },
    onError: (err) =>
      setError(!isApiError(err) && err instanceof Error ? err.message : getErrorMessage(err)),
  });

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    setError(null);
    setFiles((previous) => {
      const byKey = new Map(previous.map((file) => [`${file.name}:${file.size}`, file]));
      for (const file of Array.from(incoming)) byKey.set(`${file.name}:${file.size}`, file);
      return [...byKey.values()];
    });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const totalBytes = paired.pairs.reduce(
    (sum, pair) => sum + pair.input.size + pair.output.size,
    0,
  );
  const canUpload = paired.pairs.length > 0 && !upload.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && upload.isPending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Bulk upload tests"
      description="Select the .in and .out files together. Files are paired by name: 01.in goes with 01.out."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button
            variant={replace ? 'danger' : 'primary'}
            disabled={!canUpload}
            loading={upload.isPending}
            onClick={() => {
              setError(null);
              upload.mutate();
            }}
          >
            {replace
              ? `Replace with ${pluralize(paired.pairs.length, 'test')}`
              : `Upload ${pluralize(paired.pairs.length, 'test')}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-primary bg-primary-soft' : 'border-border-strong bg-raised/40',
          )}
        >
          <FileUp aria-hidden="true" className="size-6 text-muted" />
          <p className="text-sm text-muted">Drop .in and .out files here, or</p>
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".in,.out"
            aria-label="Test files"
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        {files.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">{pluralize(paired.pairs.length, 'pair')}</span>
                <span className="text-muted"> ready, {formatBytes(totalBytes)}</span>
              </p>
              <Button variant="ghost" size="xs" leftIcon={<X />} onClick={reset}>
                Clear files
              </Button>
            </div>
            {paired.pairs.length > 0 ? (
              <ul
                aria-label="Paired tests"
                className="max-h-44 divide-y divide-border overflow-auto rounded-control border border-border text-sm scrollbar-thin"
              >
                {paired.pairs.map((pair, index) => (
                  <li
                    key={pair.name}
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-7 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
                        {index + 1}
                      </span>
                      <span className="truncate font-mono text-[13px]">{pair.name}</span>
                      {index < samples ? (
                        <Badge size="sm" tone="info">
                          Sample
                        </Badge>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                      {formatBytes(pair.input.size)} in · {formatBytes(pair.output.size)} out
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {paired.orphans.length > 0 ? (
              <Alert
                tone="warning"
                icon={<AlertTriangle />}
                title={`${pluralize(paired.orphans.length, 'file')} will be skipped`}
              >
                <ul aria-label="Unpaired files" className="mt-1 space-y-0.5">
                  {paired.orphans.map((orphan) => (
                    <li key={`${orphan.file.name}:${orphan.file.size}`} className="text-[13px]">
                      <span className="font-mono">{orphan.file.name}</span>
                      <span className="text-muted"> — {ORPHAN_TEXT[orphan.reason]}</span>
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {paired.ignored.length > 0 ? (
              <p className="text-xs text-muted">
                Ignored (not .in or .out): {paired.ignored.map((file) => file.name).join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
          <Switch
            checked={replace}
            onCheckedChange={setReplace}
            label="Replace existing tests"
            description={
              existingCount > 0
                ? `Deletes the ${pluralize(existingCount, 'test')} this problem has now, then adds these.`
                : 'This problem has no tests yet, so nothing is deleted.'
            }
          />
          <Input
            label="Samples"
            hint="First N pairs shown in the statement"
            inputMode="numeric"
            className="font-mono"
            value={sampleCount}
            onChange={(event) => setSampleCount(event.target.value)}
          />
        </div>
        {replace && existingCount > 0 ? (
          <Alert tone="danger" title="Existing tests will be deleted">
            The upload replaces all {pluralize(existingCount, 'test')}. Submissions already judged
            keep their results.
          </Alert>
        ) : null}
        <p className="text-xs text-muted">
          Up to {LIMITS.bulkTestsMax} tests per upload; each file up to{' '}
          {formatBytes(LIMITS.testDataBytes)}. Windows line endings are converted to \n.
        </p>
        {error ? (
          <Alert tone="danger" title="Upload failed">
            {error}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
