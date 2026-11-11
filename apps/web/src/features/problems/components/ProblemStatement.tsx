import type { CheckerType, ProblemDetail, ProblemSample } from '@arbiter/shared';
import { Clock, Cpu, ScanText } from 'lucide-react';
import type { ReactNode } from 'react';
import { DifficultyBadge } from '@/components';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui';
import { formatMs, formatNumber, formatPercent } from '@/lib/format';
import { CodeBlock } from './CodeBlock';
import { ProblemStatusIcon, TagChip } from './ProblemTable';

/** 1000 -> "1 s", 2500 -> "2.5 s", 500 -> "500 ms". */
function formatLimitMs(ms: number): string {
  return ms >= 1000 && ms % 100 === 0 ? `${ms / 1000} s` : formatMs(ms);
}

const CHECKER_LABEL: Record<CheckerType, { label: string; hint: string }> = {
  TOKENS: { label: 'Token match', hint: 'Whitespace between tokens is ignored.' },
  EXACT: { label: 'Exact match', hint: 'Output must match byte for byte (line endings aside).' },
  FLOAT: { label: 'Float tolerance', hint: 'Numbers are compared with a small tolerance.' },
};

function Limit({
  icon,
  label,
  value,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[13px]" title={title}>
      <span aria-hidden="true" className="text-muted [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-muted">{label}</span>
      <span className="font-mono font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export interface SampleCardProps {
  sample: ProblemSample;
  /** Loads the sample input into the custom-input box. */
  onUseInput?: (input: string) => void;
}

export function SampleCard({ sample, onUseInput }: SampleCardProps) {
  return (
    <section
      aria-label={`Sample ${sample.ordinal}`}
      className="space-y-3 rounded-card border border-border bg-background/40 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Sample {sample.ordinal}</h3>
        {onUseInput ? (
          <Button variant="ghost" size="xs" onClick={() => onUseInput(sample.input)}>
            Use as input
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <CodeBlock
          label="Input"
          text={sample.input}
          copyLabel={`Copy sample ${sample.ordinal} input`}
          maxHeightClassName="max-h-56"
        />
        <CodeBlock
          label="Output"
          text={sample.expectedOutput}
          copyLabel={`Copy sample ${sample.ordinal} output`}
          maxHeightClassName="max-h-56"
        />
      </div>
      {sample.explanation ? (
        <div className="border-t border-border pt-3">
          <h4 className="mb-1 text-xs font-medium text-muted">Explanation</h4>
          <Markdown source={sample.explanation} className="text-sm" />
        </div>
      ) : null}
    </section>
  );
}

export interface ProblemStatementProps {
  problem: ProblemDetail;
  /** Contest label ("A") shown before the title in contest mode. */
  label?: string;
  onUseInput?: (input: string) => void;
}

/** Description tab: title, difficulty, limits, tags, Markdown + KaTeX statement and samples. */
export function ProblemStatement({ problem, label, onUseInput }: ProblemStatementProps) {
  const checker = CHECKER_LABEL[problem.checker];
  return (
    <article className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-start gap-2">
          <h1 className="text-xl leading-snug font-semibold tracking-tight text-foreground">
            {label ? <span className="mr-2 font-mono text-primary-text">{label}.</span> : null}
            {problem.title}
          </h1>
          {problem.userStatus ? (
            <ProblemStatusIcon status={problem.userStatus} className="mt-1.5" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <Limit icon={<Clock />} label="Time" value={formatLimitMs(problem.timeLimitMs)} />
          <Limit icon={<Cpu />} label="Memory" value={`${problem.memoryLimitMb} MB`} />
          <Limit icon={<ScanText />} label="Checker" value={checker.label} title={checker.hint} />
        </div>
        {problem.tags.length > 0 || problem.submissionCount > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {problem.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1" aria-label="Tags">
                {problem.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </div>
            ) : null}
            {problem.submissionCount > 0 ? (
              <p className="text-xs text-muted tabular-nums">
                {formatPercent(problem.acceptanceRate)} accepted ·{' '}
                {formatNumber(problem.acceptedCount)} / {formatNumber(problem.submissionCount)}{' '}
                submissions
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <Markdown source={problem.statementMd} />

      {problem.samples.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Samples</h2>
          {problem.samples.map((sample) => (
            <SampleCard key={sample.ordinal} sample={sample} onUseInput={onUseInput} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
