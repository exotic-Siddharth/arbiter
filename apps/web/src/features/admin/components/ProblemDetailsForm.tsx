import { DIFFICULTIES, DIFFICULTY_IDS, type AdminProblemBody } from '@arbiter/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Select,
  Switch,
} from '@/components/ui';
import { fieldErrors, getErrorMessage } from '@/lib/api';
import {
  EMPTY_PROBLEM_FORM,
  parseTags,
  problemFormToBody,
  type ProblemFormState,
  type ProblemReference,
} from '../lib/problemForm';
import { isSlugConflict } from '../lib/slugConflict';
import { MarkdownEditor } from './MarkdownEditor';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

const CHECKERS = [
  { value: 'TOKENS', label: 'Tokens (ignore whitespace differences)' },
  { value: 'EXACT', label: 'Exact (byte for byte, trailing newline aside)' },
  { value: 'FLOAT', label: 'Float (numeric tolerance)' },
];
const DIFFICULTY_OPTIONS = DIFFICULTY_IDS.map((id) => ({
  value: id,
  label: DIFFICULTIES[id].label,
}));

export interface ProblemDetailsFormProps {
  initial?: ProblemFormState;
  reference: ProblemReference;
  isNew: boolean;
  /** Saves the body; rejects with the ApiError so the form can show field errors. */
  onSave: (body: AdminProblemBody) => Promise<void>;
  /** Text of the submit button when it differs from the default. */
  saveLabel?: string;
  /** Saved test cases; publishing needs at least one (a new problem has none). */
  testCount?: number;
  /**
   * The server's version of `initial` (updatedAt). When it changes, the form re-reads `initial`,
   * but only while it has no unsaved edits: a save on another editor tab must not drop them.
   */
  version?: string;
  /**
   * Reports the unsaved-edits flag. When given, the page renders the one unsaved-changes guard
   * (React Router supports a single active blocker), so the form renders none itself.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Details tab: meta fields, markdown statement with live preview, publish toggle. */
export function ProblemDetailsForm({
  initial,
  reference,
  isNew,
  onSave,
  saveLabel,
  testCount = 0,
  version,
  onDirtyChange,
}: ProblemDetailsFormProps) {
  const [form, setForm] = useState<ProblemFormState>(initial ?? EMPTY_PROBLEM_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);

  // Re-read the server's (normalised) values once the form is clean: right after its own save,
  // or on a refetch while untouched. A dirty form keeps its edits and catches up after saving.
  const [syncedVersion, setSyncedVersion] = useState(version);
  if (version !== syncedVersion && !dirty) {
    setSyncedVersion(version);
    setForm(initial ?? EMPTY_PROBLEM_FORM);
  }

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const update = <K extends keyof ProblemFormState>(key: K, value: ProblemFormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setErrors((previous) => {
      if (!(key in previous)) return previous;
      const { [key]: _removed, ...rest } = previous;
      return rest;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const result = problemFormToBody(form, reference);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Fix the highlighted fields and save again.');
      return;
    }
    setErrors({});
    setSaving(true);
    savingRef.current = true;
    try {
      await onSave(result.body);
      setDirty(false);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        setFormError('The server rejected some fields.');
      } else if (isSlugConflict(error)) {
        setErrors({ slug: getErrorMessage(error) });
        setFormError('That slug is already used by another problem.');
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const tags = parseTags(form.tags);
  // The API refuses to publish a problem without tests (409); unpublishing stays possible.
  const cannotPublish = testCount === 0 && !form.isPublished;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
      {onDirtyChange ? null : <UnsavedChangesGuard dirty={dirty} savingRef={savingRef} />}
      {formError ? (
        <Alert tone="danger" title="Could not save the problem">
          {formError}
        </Alert>
      ) : null}
      <Card>
        <CardHeader title="Basics" description="How the problem is listed and addressed." divider />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Title"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            error={errors.title}
            maxLength={120}
            required
          />
          <Input
            label="Slug"
            hint="Used in the URL: /problems/<slug>"
            className="font-mono"
            value={form.slug}
            onChange={(event) => update('slug', event.target.value)}
            error={errors.slug}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <Select
            label="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={form.difficulty}
            onChange={(event) =>
              update('difficulty', event.target.value as ProblemFormState['difficulty'])
            }
            error={errors.difficulty}
          />
          <Input
            label="Tags"
            hint="Comma-separated, up to 10 (e.g. dp, graphs)"
            value={form.tags}
            onChange={(event) => update('tags', event.target.value)}
            error={errors.tags}
          />
          {tags.length > 0 ? (
            <p className="text-xs text-muted sm:col-span-2" aria-live="polite">
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'}: {tags.join(' · ')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Limits and checker"
          description="Applied to every test of this problem."
          divider
        />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Time limit (ms)"
            inputMode="numeric"
            className="font-mono"
            value={form.timeLimitMs}
            onChange={(event) => update('timeLimitMs', event.target.value)}
            error={errors.timeLimitMs}
            hint="100 to 10 000"
          />
          <Input
            label="Memory limit (MB)"
            inputMode="numeric"
            className="font-mono"
            value={form.memoryLimitMb}
            onChange={(event) => update('memoryLimitMb', event.target.value)}
            error={errors.memoryLimitMb}
            hint="16 to 1 024"
          />
          <Select
            label="Checker"
            options={CHECKERS}
            value={form.checker}
            onChange={(event) =>
              update('checker', event.target.value as ProblemFormState['checker'])
            }
            error={errors.checker}
            containerClassName="sm:col-span-2 lg:col-span-1"
          />
          {form.checker === 'FLOAT' ? (
            <Input
              label="Float tolerance"
              inputMode="decimal"
              className="font-mono"
              value={form.floatTolerance}
              onChange={(event) => update('floatTolerance', event.target.value)}
              error={errors.floatTolerance}
              hint="Absolute or relative, e.g. 1e-6"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Statement"
          description="Markdown with GFM tables and KaTeX math ($x^2$). Samples are added as tests marked Sample."
          divider
        />
        <CardContent>
          <MarkdownEditor
            label="Statement (Markdown)"
            value={form.statementMd}
            onChange={(value) => update('statementMd', value)}
            error={errors.statementMd}
            maxLength={100_000}
            placeholder={'## Problem\n\nDescribe the task...\n\n## Input\n\n## Output'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Switch
            checked={form.isPublished}
            onCheckedChange={(checked) => update('isPublished', checked)}
            label="Published"
            disabled={cannotPublish}
            description={
              form.isPublished
                ? 'Visible on /problems and open for submissions.'
                : cannotPublish
                  ? 'Draft: add at least one test case before publishing.'
                  : 'Draft: only admins can see it. Publish after the reference passes.'
            }
          />
          <div className="flex items-center gap-3">
            {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
            <Button type="submit" loading={saving}>
              {saveLabel ?? (isNew ? 'Create problem' : 'Save changes')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
