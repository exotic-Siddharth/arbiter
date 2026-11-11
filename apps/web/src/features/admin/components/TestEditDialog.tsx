import {
  AdminTestBody,
  AdminTestCaseSchema,
  type AdminTestCase,
  type AdminTestCaseSummary,
} from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  Input,
  QueryState,
  Skeleton,
  Switch,
  Textarea,
} from '@/components/ui';
import { api, fieldErrors, getErrorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { normalizeTestText } from '../lib/files';
import { zodFieldErrors } from '../lib/zodErrors';

export interface TestEditDialogProps {
  problemId: string;
  /** null = closed; 'new' = add a test; a summary = view and edit that test. */
  target: AdminTestCaseSummary | 'new' | null;
  onClose: () => void;
}

interface TestFormState {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  explanation: string;
  ordinal: string;
}

const EMPTY: TestFormState = {
  input: '',
  expectedOutput: '',
  isSample: false,
  explanation: '',
  ordinal: '',
};

function toForm(test: AdminTestCase): TestFormState {
  return {
    input: test.input,
    expectedOutput: test.expectedOutput,
    isSample: test.isSample,
    explanation: test.explanation ?? '',
    ordinal: String(test.ordinal),
  };
}

function TestForm({
  problemId,
  testId,
  initial,
  onClose,
}: {
  problemId: string;
  testId: string | null;
  initial: TestFormState;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof TestFormState>(key: K, value: TestFormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: '' }));
  };

  const save = useMutation({
    mutationFn: (body: AdminTestBody) =>
      testId
        ? api.put(`/admin/problems/${problemId}/tests/${testId}`, body, {
            schema: AdminTestCaseSchema,
          })
        : api.post(`/admin/problems/${problemId}/tests`, body, { schema: AdminTestCaseSchema }),
    onSuccess: () => {
      toast.success(testId ? 'Test saved' : 'Test added');
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.tests(problemId) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.detail(problemId) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
      if (testId)
        void queryClient.invalidateQueries({ queryKey: qk.admin.problems.test(problemId, testId) });
      onClose();
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length > 0) setErrors(fields);
      setFormError(getErrorMessage(error));
    },
  });

  const submit = () => {
    setFormError(null);
    const ordinal = form.ordinal.trim() === '' ? undefined : Number(form.ordinal);
    const parsed = AdminTestBody.safeParse({
      input: normalizeTestText(form.input),
      expectedOutput: normalizeTestText(form.expectedOutput),
      isSample: form.isSample,
      explanation: form.isSample && form.explanation.trim() ? form.explanation : null,
      ordinal,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError('Fix the highlighted fields.');
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <form
      id="test-edit-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Textarea
          mono
          label="Input"
          rows={10}
          value={form.input}
          onChange={(event) => set('input', event.target.value)}
          error={errors.input || undefined}
          hint={formatBytes(new Blob([form.input]).size)}
          spellCheck={false}
          wrap="off"
        />
        <Textarea
          mono
          label="Expected output"
          rows={10}
          value={form.expectedOutput}
          onChange={(event) => set('expectedOutput', event.target.value)}
          error={errors.expectedOutput || undefined}
          hint={formatBytes(new Blob([form.expectedOutput]).size)}
          spellCheck={false}
          wrap="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start">
        <Switch
          checked={form.isSample}
          onCheckedChange={(checked) => set('isSample', checked)}
          label="Sample"
          description="Shown in the statement and used by Run."
        />
        <Input
          label="Position"
          hint={testId ? 'Test number' : 'Blank = last'}
          inputMode="numeric"
          className="font-mono"
          value={form.ordinal}
          onChange={(event) => set('ordinal', event.target.value)}
          error={errors.ordinal || undefined}
        />
      </div>
      {form.isSample ? (
        <Textarea
          label="Explanation (Markdown)"
          rows={3}
          value={form.explanation}
          onChange={(event) => set('explanation', event.target.value)}
          error={errors.explanation || undefined}
        />
      ) : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {testId ? 'Save test' : 'Add test'}
        </Button>
      </div>
    </form>
  );
}

/** Adds a test or shows the full data of one (the list only carries previews) and edits it. */
export function TestEditDialog({ problemId, target, onClose }: TestEditDialogProps) {
  const testId = target && target !== 'new' ? target.id : null;
  const test = useQuery({
    queryKey: qk.admin.problems.test(problemId, testId ?? ''),
    queryFn: ({ signal }) =>
      api.get(`/admin/problems/${problemId}/tests/${testId}`, {
        schema: AdminTestCaseSchema,
        signal,
      }),
    enabled: testId !== null,
    staleTime: 0,
  });
  // Keep the last target while the dialog animates out.
  const [lastTitle, setLastTitle] = useState('Add test');
  useEffect(() => {
    if (target === 'new') setLastTitle('Add test');
    else if (target) setLastTitle(`Test ${target.ordinal}`);
  }, [target]);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={lastTitle}
      description={
        target === 'new'
          ? 'Input and expected output are stored exactly as typed (line endings normalised to \\n).'
          : undefined
      }
      size="xl"
    >
      {target === 'new' ? (
        <TestForm problemId={problemId} testId={null} initial={EMPTY} onClose={onClose} />
      ) : target ? (
        <QueryState
          query={test}
          loading={
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          }
        >
          {(data) => (
            <TestForm
              problemId={problemId}
              testId={data.id}
              initial={toForm(data)}
              onClose={onClose}
            />
          )}
        </QueryState>
      ) : null}
    </Dialog>
  );
}
