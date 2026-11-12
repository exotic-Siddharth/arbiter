import { VERDICTS, type ProblemSample, type RunResult } from '@arbiter/shared';
import { CircleCheck, CircleX, ServerCrash } from 'lucide-react';
import { Badge, Spinner } from '@/components/ui';
import { formatMemoryKb, formatMs } from '@/lib/format';
import type { RunPhase } from '../hooks/useRun';
import { CodeBlock } from './CodeBlock';
import { changedLines, outputLines } from '../lib/diff';
import { OutputDiff } from './OutputDiff';

const RUN_STATUS: Record<RunResult['status'], { label: string; token: string }> = {
  OK: { label: 'Finished', token: VERDICTS.AC.token },
  CE: { label: VERDICTS.CE.label, token: VERDICTS.CE.token },
  RE: { label: VERDICTS.RE.label, token: VERDICTS.RE.token },
  TLE: { label: VERDICTS.TLE.label, token: VERDICTS.TLE.token },
  MLE: { label: VERDICTS.MLE.label, token: VERDICTS.MLE.token },
  OLE: { label: VERDICTS.OLE.label, token: VERDICTS.OLE.token },
  IE: { label: VERDICTS.IE.label, token: VERDICTS.IE.token },
};

export interface RunOutputProps {
  phase: RunPhase;
  result: RunResult | null;
  /** The sample whose input the run used, if any: its expected output is compared. */
  sample?: ProblemSample;
}

const PHASE_TEXT: Partial<Record<RunPhase, string>> = {
  starting: 'Sending your code to the sandbox…',
  running: 'Running on your input…',
};

/** The sample comparison of a finished run, if its input was a sample. */
function compareSample(result: RunResult, sample: ProblemSample | undefined) {
  const compared = sample && result.status === 'OK' ? sample : undefined;
  const matches = compared
    ? changedLines(outputLines(compared.expectedOutput), outputLines(result.stdout)).size === 0
    : false;
  return { compared, matches };
}

/** One line for screen readers: phase, or status label, time, memory and the sample match. */
function runSummary({ phase, result, sample }: RunOutputProps): string {
  const pending = PHASE_TEXT[phase];
  if (pending) return pending;
  // 'unavailable' is announced by its own alert.
  if (phase !== 'done' || !result) return '';
  const { compared, matches } = compareSample(result, sample);
  const parts = [
    RUN_STATUS[result.status].label,
    formatMs(result.timeMs),
    formatMemoryKb(result.memoryKb),
  ];
  if (compared) {
    parts.push(
      `${matches ? 'Matches' : 'Differs from'} the expected output of sample ${compared.ordinal}`,
    );
  }
  return parts.join(' · ');
}

/** Output of a custom-input run (stdout, stderr, compile output, sample comparison). */
export function RunOutput(props: RunOutputProps) {
  // The live region is always mounted and holds only a summary, so screen readers hear the
  // running state and then the outcome, not the whole program output or diff.
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {runSummary(props)}
      </p>
      <RunOutputBody {...props} />
    </>
  );
}

function RunOutputBody({ phase, result, sample }: RunOutputProps) {
  if (phase === 'starting' || phase === 'running') {
    return (
      <div className="flex items-center gap-2.5 py-2 text-sm text-muted">
        <Spinner size="sm" />
        {PHASE_TEXT[phase]}
      </div>
    );
  }

  if (phase === 'unavailable' || !result) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-card border border-verdict-ie/35 bg-verdict-ie/10 p-4"
      >
        <ServerCrash aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-verdict-ie" />
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-foreground">Judge unavailable</h3>
          <p className="text-sm text-muted">
            The sandbox didn&apos;t return a result for this run. This is not a problem with your
            code; please try again in a minute.
          </p>
        </div>
      </div>
    );
  }

  const info = RUN_STATUS[result.status];
  const color = `var(--color-${info.token})`;
  const { compared, matches } = compareSample(result, sample);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge color={color} mono>
          {info.label}
        </Badge>
        <span className="font-mono text-[13px] text-muted tabular-nums">
          {formatMs(result.timeMs)} · {formatMemoryKb(result.memoryKb)}
        </span>
        {compared ? (
          matches ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-verdict-ac">
              <CircleCheck aria-hidden="true" className="size-4" />
              Matches the expected output of sample {compared.ordinal}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-verdict-wa">
              <CircleX aria-hidden="true" className="size-4" />
              Differs from the expected output of sample {compared.ordinal}
            </span>
          )
        ) : null}
      </div>

      {result.status === 'CE' ? (
        <CodeBlock
          label="Compiler output"
          text={result.compileOutput ?? ''}
          emptyText="(the compiler printed nothing)"
          copyLabel="Copy compiler output"
          tone="danger"
          maxHeightClassName="max-h-80"
        />
      ) : compared && !matches ? (
        <OutputDiff
          title={`Sample ${compared.ordinal}`}
          ordinal={compared.ordinal}
          input={compared.input}
          expectedOutput={compared.expectedOutput}
          actualOutput={result.stdout}
          stderr={result.stderr}
        />
      ) : (
        <>
          <CodeBlock label="Output" text={result.stdout} copyLabel="Copy output" />
          {result.stderr ? (
            <CodeBlock
              label="stderr"
              text={result.stderr}
              tone="danger"
              maxHeightClassName="max-h-40"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
