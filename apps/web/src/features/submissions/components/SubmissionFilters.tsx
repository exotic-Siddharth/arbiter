import { LANGUAGES, LANGUAGE_IDS, VERDICTS, VERDICT_IDS, ProblemPageSchema } from '@arbiter/shared';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Badge, Button, Select, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type { SubmissionFilterValues } from '../lib/filters';

const VERDICT_OPTIONS = VERDICT_IDS.map((id) => ({ value: id, label: VERDICTS[id].label }));
const LANGUAGE_OPTIONS = LANGUAGE_IDS.map((id) => ({ value: id, label: LANGUAGES[id].label }));
const PROBLEM_OPTIONS_PARAMS = { sort: 'title', page: 1, pageSize: 100 } as const;

export interface SubmissionFiltersProps {
  values: SubmissionFilterValues;
  signedIn: boolean;
  active: boolean;
  onChange: (patch: Partial<SubmissionFilterValues>) => void;
  onClear: () => void;
}

/** Mine/all, problem, verdict and language filters for /submissions (URL-synced). */
export function SubmissionFilters({
  values,
  signedIn,
  active,
  onChange,
  onClear,
}: SubmissionFiltersProps) {
  const problems = useQuery({
    queryKey: qk.problems.list(PROBLEM_OPTIONS_PARAMS),
    queryFn: ({ signal }) =>
      api.get('/problems', { query: PROBLEM_OPTIONS_PARAMS, schema: ProblemPageSchema, signal }),
    staleTime: 5 * 60_000,
  });
  const problemOptions = (problems.data?.items ?? []).map((problem) => ({
    value: problem.slug,
    label: problem.title,
  }));
  if (values.problem && !problemOptions.some((option) => option.value === values.problem)) {
    problemOptions.unshift({ value: values.problem, label: values.problem });
  }

  return (
    <div
      role="search"
      aria-label="Filter submissions"
      className="flex flex-col gap-3 lg:flex-row lg:items-end"
    >
      {signedIn ? (
        <Tabs
          value={values.mine === 'true' ? 'mine' : 'all'}
          onValueChange={(value) => onChange({ mine: value === 'mine' ? 'true' : '' })}
          variant="pills"
        >
          <TabsList aria-label="Whose submissions" className="h-9">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">Mine</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <Select
          label="Problem"
          placeholder="All problems"
          options={problemOptions}
          value={values.problem}
          onChange={(event) => onChange({ problem: event.target.value })}
          containerClassName="col-span-2 sm:w-56"
        />
        <Select
          label="Verdict"
          placeholder="Any verdict"
          options={VERDICT_OPTIONS}
          value={values.verdict.toUpperCase()}
          onChange={(event) => onChange({ verdict: event.target.value })}
          containerClassName="sm:w-52"
        />
        <Select
          label="Language"
          placeholder="Any language"
          options={LANGUAGE_OPTIONS}
          value={values.language.toUpperCase()}
          onChange={(event) => onChange({ language: event.target.value })}
          containerClassName="sm:w-48"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        {values.username ? (
          <Badge tone="primary" className="h-8 gap-1 pr-1">
            by {values.username}
            <button
              type="button"
              aria-label={`Remove the filter for user ${values.username}`}
              onClick={() => onChange({ username: '' })}
              className="flex size-5 items-center justify-center rounded hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </Badge>
        ) : null}
        {active ? (
          <Button variant="ghost" leftIcon={<X />} onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
