import type { AdminContestBody } from '@arbiter/shared';
import { useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, CardContent, CardHeader, Input, Switch } from '@/components/ui';
import { fieldErrors, getErrorMessage, isApiError } from '@/lib/api';
import {
  contestFormToBody,
  emptyContestForm,
  type ContestFormProblem,
  type ContestFormState,
} from '../lib/contestForm';
import { localTimeZone } from '../lib/datetime';
import { ContestProblemsEditor } from './ContestProblemsEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

export interface ContestFormProps {
  initial?: ContestFormState;
  isNew: boolean;
  onSave: (body: AdminContestBody) => Promise<void>;
  /** Rated contest: times, penalty and problems are fixed (the API answers 409). */
  ratedLocked?: boolean;
}

/** Contest editor form: details, schedule, penalty, problem picker with labels. */
export function ContestForm({ initial, isNew, onSave, ratedLocked = false }: ContestFormProps) {
  const [form, setForm] = useState<ContestFormState>(() => initial ?? emptyContestForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const zone = localTimeZone();

  const update = <K extends keyof ContestFormState>(key: K, value: ContestFormState[K]) => {
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
    const result = contestFormToBody(form);
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
      } else if (isApiError(error) && error.status === 409 && /slug/i.test(error.message)) {
        setErrors({ slug: getErrorMessage(error) });
        setFormError('That slug is already used by another contest.');
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const startsMs = form.startsAt ? Date.parse(form.startsAt) : Number.NaN;
  const endsMs = form.endsAt ? Date.parse(form.endsAt) : Number.NaN;
  const lengthMinutes =
    Number.isFinite(startsMs) && Number.isFinite(endsMs)
      ? Math.round((endsMs - startsMs) / 60_000)
      : null;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
      <UnsavedChangesGuard dirty={dirty} savingRef={savingRef} />
      {formError ? (
        <Alert tone="danger" title="Could not save the contest">
          {formError}
        </Alert>
      ) : null}
      {ratedLocked ? (
        <Alert tone="info" title="Ratings were computed from this contest">
          Its times, penalty and problems are fixed. The title, description and visibility can still
          change.
        </Alert>
      ) : null}
      <Card>
        <CardHeader title="Details" description="Title and address of the contest page." divider />
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
            hint="Used in the URL: /contests/<slug>"
            className="font-mono"
            value={form.slug}
            onChange={(event) => update('slug', event.target.value)}
            error={errors.slug}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Schedule and scoring"
          description={`Times are in your local time zone (${zone}).`}
          divider
        />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            type="datetime-local"
            label="Starts"
            value={form.startsAt}
            disabled={ratedLocked}
            onChange={(event) => update('startsAt', event.target.value)}
            error={errors.startsAt}
          />
          <Input
            type="datetime-local"
            label="Ends"
            value={form.endsAt}
            disabled={ratedLocked}
            onChange={(event) => update('endsAt', event.target.value)}
            error={errors.endsAt}
            hint={
              lengthMinutes !== null && lengthMinutes > 0
                ? `Length ${Math.floor(lengthMinutes / 60)} h ${lengthMinutes % 60} min`
                : undefined
            }
          />
          <Input
            label="Penalty (minutes)"
            inputMode="numeric"
            className="font-mono"
            value={form.penaltyMinutes}
            disabled={ratedLocked}
            onChange={(event) => update('penaltyMinutes', event.target.value)}
            error={errors.penaltyMinutes}
            hint="Added per wrong attempt, 0 to 240"
          />
        </CardContent>
      </Card>

      <fieldset disabled={ratedLocked} className="m-0 min-w-0 border-0 p-0">
        <ContestProblemsEditor
          problems={form.problems}
          errors={errors}
          onChange={(problems: ContestFormProblem[]) => update('problems', problems)}
        />
      </fieldset>

      <Card>
        <CardHeader
          title="Description"
          description="Markdown shown on the contest page. Contestants see it before the start."
          divider
        />
        <CardContent>
          <MarkdownEditor
            label="Description (Markdown)"
            value={form.descriptionMd}
            onChange={(value) => update('descriptionMd', value)}
            error={errors.descriptionMd}
            maxLength={50_000}
            rows={10}
            placeholder={'Rules, scoring and anything contestants should know.'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Switch
            checked={form.isPublished}
            onCheckedChange={(checked) => update('isPublished', checked)}
            label="Published"
            description={
              form.isPublished
                ? 'Listed on /contests; people can register.'
                : 'Draft: only admins can open it by its address.'
            }
          />
          <div className="flex items-center gap-3">
            {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
            <Button type="submit" loading={saving}>
              {isNew ? 'Create contest' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
