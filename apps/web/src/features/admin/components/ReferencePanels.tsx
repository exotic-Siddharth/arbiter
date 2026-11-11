import {
  AdminJobSchema,
  ValidateReferenceResponseSchema,
  GenerateOutputsResponseSchema,
  type AdminJob,
  VERDICTS,
} from '@arbiter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Cog, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VerdictBadge } from '@/components';
import { Alert, Button, Card, CardContent, CardHeader, ProgressBar } from '@/components/ui';
import { api, getErrorMessage } from '@/lib/api';
import { formatMemoryKb, formatMs, pluralize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { toast, toastError } from '@/lib/toast';
import { useValidationRun, type ValidationRun } from '../hooks/useValidationRun';

function TestChips({ run }: { run: ValidationRun }) {
  if (run.tests.length === 0) return null;
  return (
    <ul aria-label="Test verdicts" className="flex flex-wrap gap-1">
      {run.tests.map((test) => (
        <li
          key={test.ordinal}
          title={`Test ${test.ordinal}: ${VERDICTS[test.verdict].label}, ${formatMs(test.timeMs)}`}
          style={{ color: `var(--color-${VERDICTS[test.verdict].token})` }}
          className="flex h-6 min-w-8 items-center justify-center rounded-[6px] border border-current/40 bg-current/10 px-1.5 font-mono text-[11px] font-medium tabular-nums"
        >
          <span className="sr-only">
            Test {test.ordinal}: {VERDICTS[test.verdict].label}
          </span>
          <span aria-hidden="true">{test.ordinal}</span>
        </li>
      ))}
    </ul>
  );
}

function ValidationResult({ run }: { run: ValidationRun }) {
  const accepted = run.finished && run.verdict === 'AC';
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <VerdictBadge
          verdict={run.verdict}
          status={run.status}
          testsDone={run.testsDone}
          testsTotal={run.testsTotal}
        />
        {run.finished ? (
          <span className="text-sm text-muted">
            <span className="font-mono tabular-nums text-foreground">
              {run.testsPassed}/{run.testsTotal}
            </span>{' '}
            tests passed
            {run.timeMs !== null ? (
              <>
                {' · '}
                <span className="font-mono tabular-nums">{formatMs(run.timeMs)}</span>
                {run.memoryKb !== null ? (
                  <>
                    {' · '}
                    <span className="font-mono tabular-nums">{formatMemoryKb(run.memoryKb)}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      {!run.finished && run.testsTotal > 0 ? (
        <ProgressBar
          label="Reference tests run"
          value={run.testsDone}
          max={run.testsTotal}
          valueText={`${run.testsDone} of ${run.testsTotal} tests`}
          showLabel
          valueLabel={`${run.testsDone} / ${run.testsTotal}`}
        />
      ) : null}
      <TestChips run={run} />
      {run.finished && accepted ? (
        <Alert tone="success" icon={<CircleCheck />} title="The reference solution is accepted">
          It passes all {pluralize(run.testsTotal, 'test')} within the limits, so the tests and
          limits are consistent.
        </Alert>
      ) : null}
      {run.finished && !accepted ? (
        <Alert tone="danger" icon={<CircleX />} title="The reference solution did not pass">
          {run.verdict === 'CE'
            ? 'It does not compile. See the compile output below.'
            : run.verdict === 'WA'
              ? 'It produced a wrong answer on a test: the stored expected output may be stale. Generate outputs from the reference, or fix the test.'
              : (run.errorMessage ?? 'Check the limits and the failing test verdicts above.')}
        </Alert>
      ) : null}
      {run.finished && run.compileOutput ? (
        <pre className="max-h-48 overflow-auto rounded-control border border-border bg-background/50 p-3 font-mono text-xs scrollbar-thin">
          {run.compileOutput}
        </pre>
      ) : null}
    </div>
  );
}

export interface ValidatePanelProps {
  problemId: string;
  /** The editor holds changes that are not saved yet: the server judges the stored solution. */
  dirty: boolean;
  hasReference: boolean;
  testCount: number;
}

/** Validate: enqueue a REFERENCE submission and watch it like any submission. */
export function ValidatePanel({ problemId, dirty, hasReference, testCount }: ValidatePanelProps) {
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const { run } = useValidationRun(submissionId);
  const start = useMutation({
    mutationFn: () =>
      api.post(`/admin/problems/${problemId}/validate-reference`, undefined, {
        schema: ValidateReferenceResponseSchema,
      }),
    onSuccess: (result) => setSubmissionId(result.submissionId),
    onError: (error) => toastError(error, 'Could not start the validation'),
  });
  const running = start.isPending || (run !== null && !run.finished);
  const blocked = dirty
    ? 'Save the reference first: the judge runs the stored solution.'
    : !hasReference
      ? 'Save a reference solution first.'
      : testCount === 0
        ? 'Add tests first.'
        : null;

  return (
    <Card>
      <CardHeader
        title="Validate reference"
        description="Judges the stored reference solution against every test with the real sandbox."
        divider
        actions={
          <Button
            size="sm"
            leftIcon={<ShieldCheck />}
            loading={running}
            disabled={blocked !== null}
            onClick={() => start.mutate()}
          >
            {run ? 'Validate again' : 'Validate'}
          </Button>
        }
      />
      <CardContent className="space-y-3">
        {blocked ? <p className="text-sm text-muted">{blocked}</p> : null}
        {run ? (
          <ValidationResult run={run} />
        ) : submissionId ? (
          <p className="text-sm text-muted">Waiting for the judge</p>
        ) : !blocked ? (
          <p className="text-sm text-muted">Not validated in this session.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function jobDone(job: AdminJob | undefined): boolean {
  return job?.status === 'DONE' || job?.status === 'FAILED';
}

export interface GeneratePanelProps {
  problemId: string;
  dirty: boolean;
  hasReference: boolean;
  testCount: number;
}

/** Generate outputs: run the reference on every input and overwrite expectedOutput. */
export function GeneratePanel({ problemId, dirty, hasReference, testCount }: GeneratePanelProps) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () =>
      api.post(`/admin/problems/${problemId}/generate-outputs`, undefined, {
        schema: GenerateOutputsResponseSchema,
      }),
    onSuccess: (result) => setJobId(result.jobId),
    onError: (error) => toastError(error, 'Could not start output generation'),
  });

  const job = useQuery({
    queryKey: qk.admin.job(jobId ?? ''),
    queryFn: ({ signal }) => api.get(`/admin/jobs/${jobId}`, { schema: AdminJobSchema, signal }),
    enabled: jobId !== null,
    staleTime: 0,
    refetchInterval: (query) => (jobDone(query.state.data) ? false : 1000),
  });

  const data = job.data;
  const finishedStatus = data?.status === 'DONE' ? jobId : null;
  useEffect(() => {
    if (!finishedStatus) return;
    toast.success('Expected outputs regenerated');
    void queryClient.invalidateQueries({ queryKey: qk.admin.problems.tests(problemId) });
  }, [finishedStatus, problemId, queryClient]);
  const running = start.isPending || (jobId !== null && !jobDone(data));
  const blocked = dirty
    ? 'Save the reference first: outputs are generated by the stored solution.'
    : !hasReference
      ? 'Save a reference solution first.'
      : testCount === 0
        ? 'Add tests first.'
        : null;

  return (
    <Card>
      <CardHeader
        title="Generate outputs"
        description="Runs the reference on every input and overwrites the expected outputs."
        divider
        actions={
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Cog />}
            loading={running}
            disabled={blocked !== null}
            onClick={() => start.mutate()}
          >
            Generate outputs
          </Button>
        }
      />
      <CardContent className="space-y-3">
        {blocked ? <p className="text-sm text-muted">{blocked}</p> : null}
        {jobId && !data && !job.isError ? (
          <p className="text-sm text-muted">Starting the job</p>
        ) : null}
        {job.isError ? (
          <Alert tone="danger" title="Could not read the job status">
            {getErrorMessage(job.error)}
          </Alert>
        ) : null}
        {data ? (
          <div className="space-y-2" aria-live="polite">
            <ProgressBar
              label="Outputs generated"
              value={data.progress}
              max={Math.max(1, data.total)}
              valueText={`${data.progress} of ${data.total} tests`}
              color={
                data.status === 'FAILED'
                  ? 'var(--color-danger)'
                  : data.status === 'DONE'
                    ? 'var(--color-success)'
                    : undefined
              }
              showLabel
              valueLabel={`${data.progress} / ${data.total}`}
            />
            {data.status === 'DONE' ? (
              <Alert tone="success" title="Done">
                {pluralize(data.total, 'expected output')} regenerated from the reference solution.
              </Alert>
            ) : null}
            {data.status === 'FAILED' ? (
              <Alert tone="danger" title="Generation failed">
                {data.error ?? 'The reference solution failed on one of the inputs.'}
              </Alert>
            ) : null}
          </div>
        ) : null}
        {!jobId && !blocked ? (
          <p className="text-sm text-muted">
            Overwrites every expected output. Review the reference with Validate first.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
