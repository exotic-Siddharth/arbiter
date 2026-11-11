import {
  LANGUAGES,
  LANGUAGE_IDS,
  SourceCodeSchema,
  type AdminProblem,
  type Language,
} from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CodeEditor } from '@/components/CodeEditor';
import { Alert, Button, Card, CardContent, CardHeader, Select } from '@/components/ui';
import { api, getErrorMessage, isApiError } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/lib/toast';
import { problemWithReference } from '../lib/problemForm';
import { GeneratePanel, ValidatePanel } from './ReferencePanels';

const LANGUAGE_OPTIONS = LANGUAGE_IDS.map((id) => ({ value: id, label: LANGUAGES[id].label }));

/** Reference tab: Monaco for the reference solution, then Validate and Generate outputs. */
export function ProblemReferenceTab({ problem }: { problem: AdminProblem }) {
  const queryClient = useQueryClient();
  const savedLanguage: Language = problem.referenceLanguage ?? 'CPP';
  const savedSource = problem.referenceSolution ?? '';
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [source, setSource] = useState<string>(savedSource || LANGUAGES[savedLanguage].template);
  const [error, setError] = useState<string | null>(null);

  const hasReference =
    problem.referenceSolution !== null && problem.referenceSolution.trim() !== '';
  const dirty =
    language !== savedLanguage || source !== (savedSource || LANGUAGES[savedLanguage].template);
  // A template that was never saved is not a reference solution.
  const unsavedTemplate = !hasReference;

  const save = useMutation({
    mutationFn: () => {
      const parsed = SourceCodeSchema.safeParse(source);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid source code');
      return api.put(
        `/admin/problems/${problem.id}`,
        problemWithReference(problem, { referenceLanguage: language, referenceSolution: source }),
      );
    },
    onSuccess: async () => {
      setError(null);
      toast.success('Reference solution saved');
      await queryClient.invalidateQueries({ queryKey: qk.admin.problems.detail(problem.id) });
      void queryClient.invalidateQueries({ queryKey: qk.admin.problems.all });
    },
    onError: (err) =>
      setError(!isApiError(err) && err instanceof Error ? err.message : getErrorMessage(err)),
  });

  const changeLanguage = (next: Language) => {
    // Swap the template only while the code is still the untouched starter of the old language.
    if (source === LANGUAGES[language].template || source.trim() === '')
      setSource(LANGUAGES[next].template);
    setLanguage(next);
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Reference solution"
          description="A known-correct solution. It validates the tests and generates expected outputs."
          divider
          actions={
            <>
              <Select
                aria-label="Reference language"
                size="sm"
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={(event) => changeLanguage(event.target.value as Language)}
              />
              <Button
                size="sm"
                loading={save.isPending}
                disabled={!dirty}
                onClick={() => save.mutate()}
              >
                Save reference
              </Button>
            </>
          }
        />
        <CardContent className="space-y-3">
          {error ? (
            <Alert tone="danger" title="Could not save the reference">
              {error}
            </Alert>
          ) : null}
          <div className="h-[26rem] overflow-hidden rounded-control border border-border">
            <CodeEditor
              language={language}
              value={source}
              onChange={setSource}
              ariaLabel="Reference solution source code"
              path={`reference-${problem.id}-${language}`}
            />
          </div>
          <p className="text-xs text-muted">
            {unsavedTemplate && !dirty
              ? 'No reference yet: the editor shows the starter template.'
              : dirty
                ? 'Unsaved changes.'
                : 'Saved.'}
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <ValidatePanel
          problemId={problem.id}
          dirty={dirty || unsavedTemplate}
          hasReference={hasReference}
          testCount={problem.testCount}
        />
        <GeneratePanel
          problemId={problem.id}
          dirty={dirty || unsavedTemplate}
          hasReference={hasReference}
          testCount={problem.testCount}
        />
      </div>
    </div>
  );
}
