import { PENDING_STYLE, VERDICTS, type SubmissionDetail } from '@arbiter/shared';
import { CircleCheck, CircleX, ExternalLink, ServerCrash } from 'lucide-react';
import { Link } from 'react-router';
import { ProgressBar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMemoryKb, formatMs } from '@/lib/format';
import { isJudgeFailure, isPendingStatus, type SubmissionProgress } from '../lib/progress';
import { CodeBlock } from './CodeBlock';
import { OutputDiff } from './OutputDiff';
import { StatusStepper } from './StatusStepper';
import { TestChips } from './TestChips';

export interface ResultPanelProps {
  progress: SubmissionProgress;
  /** REST detail: compile output, failed sample and admin error details. */
  detail?: SubmissionDetail;
  /** Show a link to the full submission page (default true). */
  showDetailsLink?: boolean;
  className?: string;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="font-mono text-sm text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function JudgeUnavailable({ errorMessage }: { errorMessage?: string | null }) {
  const color = `var(--color-${VERDICTS.IE.token})`;
  return (
    <div
      className="rounded-card border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 9%, transparent)`,
      }}
    >
      <div className="flex items-start gap-3">
        <ServerCrash aria-hidden="true" className="mt-0.5 size-5 shrink-0" style={{ color }} />
        <div className="min-w-0 space-y-1">
          <h3 className="text-[15px] font-semibold text-foreground">Judge unavailable</h3>
          <p className="text-sm text-muted">
            The judge couldn&apos;t finish this submission. This is not a problem with your code:
            the sandbox was unavailable, so it was marked as an internal error. Try submitting again
            in a minute.
          </p>
          {errorMessage ? (
            <p className="pt-1 font-mono text-xs break-words text-muted">Details: {errorMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function VerdictBanner({ progress }: { progress: SubmissionProgress }) {
  const verdict = progress.verdict ?? 'IE';
  const info = VERDICTS[verdict];
  const color = `var(--color-${info.token})`;
  const accepted = verdict === 'AC';
  const Icon = accepted ? CircleCheck : CircleX;
  const total = progress.testsTotal;
  return (
    <div
      className="rounded-card border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 9%, transparent)`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon aria-hidden="true" className="size-6 shrink-0" style={{ color }} />
          <div className="min-w-0">
            <h3 className="text-lg leading-tight font-semibold" style={{ color }}>
              {info.label}
            </h3>
            {verdict !== 'CE' && total > 0 ? (
              <p className="text-[13px] text-muted">
                {progress.testsPassed} / {total} tests passed
              </p>
            ) : null}
          </div>
        </div>
        {verdict !== 'CE' ? (
          <dl className="flex gap-6">
            <Metric label="Time" value={formatMs(progress.timeMs)} />
            <Metric label="Memory" value={formatMemoryKb(progress.memoryKb)} />
          </dl>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Submission result: stepper and progress bar while judging, per-test chips, then the final
 * verdict banner with time and memory, the failed-sample diff, compile output for CE, or the
 * "Judge unavailable" state for FAILED/IE (never an endless spinner). The verdict area is an
 * aria-live region so screen readers hear the outcome.
 */
export function ResultPanel({
  progress,
  detail,
  showDetailsLink = true,
  className,
}: ResultPanelProps) {
  const pending = isPendingStatus(progress.status);
  const failed = !pending && isJudgeFailure(progress);
  const total = progress.testsTotal;
  const done = Math.min(progress.testsDone, total || progress.testsDone);

  return (
    <div className={cn('space-y-4', className)}>
      <div aria-live="polite" className="space-y-4">
        {pending ? (
          <div className="space-y-3">
            <StatusStepper
              status={progress.status}
              testsDone={done}
              testsTotal={total}
              className="flex-wrap"
            />
            <ProgressBar
              label="Tests judged"
              value={done}
              max={Math.max(total, 1)}
              valueText={`${done} of ${total} tests`}
              color={`var(--color-${PENDING_STYLE.token})`}
            />
            {progress.status === 'QUEUED' ? (
              <p className="text-[13px] text-muted">Waiting for a free judge worker…</p>
            ) : null}
          </div>
        ) : failed ? (
          <JudgeUnavailable errorMessage={detail?.errorMessage} />
        ) : (
          <VerdictBanner progress={progress} />
        )}
      </div>

      {!failed && progress.verdict !== 'CE' && (total > 0 || progress.tests.length > 0) ? (
        <div className="space-y-2">
          {!pending ? (
            <ProgressBar
              label="Tests passed"
              value={progress.testsPassed}
              max={Math.max(total, 1)}
              valueText={`${progress.testsPassed} of ${total} tests passed`}
              color={`var(--color-${VERDICTS[progress.verdict === 'AC' ? 'AC' : 'WA'].token})`}
              size="xs"
            />
          ) : null}
          <TestChips tests={progress.tests} total={total} running={pending} />
        </div>
      ) : null}

      {!pending && progress.verdict === 'CE' ? (
        <CodeBlock
          label="Compiler output"
          text={detail?.compileOutput ?? ''}
          emptyText={detail ? '(the compiler printed nothing)' : 'Loading compiler output…'}
          copyLabel="Copy compiler output"
          tone="danger"
          maxHeightClassName="max-h-80"
        />
      ) : null}

      {!pending && detail?.failedSample ? (
        <OutputDiff
          ordinal={detail.failedSample.ordinal}
          input={detail.failedSample.input}
          expectedOutput={detail.failedSample.expectedOutput}
          actualOutput={detail.failedSample.actualOutput}
          stderr={detail.failedSample.stderr}
        />
      ) : null}

      {showDetailsLink ? (
        <Link
          to={`/submissions/${progress.id}`}
          className="inline-flex items-center gap-1.5 rounded-sm text-[13px] font-medium text-primary-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          View submission details
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
