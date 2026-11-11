import { CopyButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { changedLines, outputLines } from '../lib/diff';
import { CodeBlock } from './CodeBlock';

interface DiffColumnProps {
  title: string;
  text: string;
  lines: readonly string[];
  changed: ReadonlySet<number>;
  side: 'expected' | 'actual';
}

function DiffColumn({ title, text, lines, changed, side }: DiffColumnProps) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{title}</span>
        {text ? <CopyButton text={text} label={`Copy ${title.toLowerCase()}`} size="xs" /> : null}
      </div>
      <div
        data-testid={`diff-${side}`}
        className="max-h-64 overflow-auto rounded-control border border-border bg-raised/60 py-1.5 font-mono text-[13px] leading-5 scrollbar-thin"
      >
        {lines.length === 0 ? (
          <div className="px-3 py-1 text-muted italic">(empty)</div>
        ) : (
          lines.map((line, index) => {
            const isChanged = changed.has(index);
            return (
              <div
                key={index}
                data-diff={isChanged ? 'changed' : 'same'}
                className={cn(
                  'flex min-w-max',
                  isChanged &&
                    (side === 'expected'
                      ? 'bg-verdict-ac/12 text-foreground'
                      : 'bg-verdict-wa/12 text-foreground'),
                )}
              >
                <span
                  aria-hidden="true"
                  className="w-9 shrink-0 pr-2 text-right text-muted/70 tabular-nums select-none"
                >
                  {index + 1}
                </span>
                <span className="w-4 shrink-0 text-muted select-none" aria-hidden="true">
                  {isChanged ? (side === 'expected' ? '+' : '−') : ''}
                </span>
                <span className="pr-3 whitespace-pre">{line === '' ? ' ' : line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface OutputDiffProps {
  ordinal: number;
  /** Heading (default "Failed on sample N"). */
  title?: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  stderr?: string;
  className?: string;
}

/** Failed sample: input, then expected vs actual output side by side with differing lines marked. */
export function OutputDiff({
  ordinal,
  title,
  input,
  expectedOutput,
  actualOutput,
  stderr,
  className,
}: OutputDiffProps) {
  const expected = outputLines(expectedOutput);
  const actual = outputLines(actualOutput);
  const changed = changedLines(expected, actual);
  const firstChanged = Math.min(...changed);

  return (
    <section
      aria-label={title ?? `Failed sample ${ordinal}`}
      className={cn('space-y-3', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          {title ?? `Failed on sample ${ordinal}`}
        </h4>
        {changed.size > 0 && Number.isFinite(firstChanged) ? (
          <p className="text-xs text-muted">
            First difference on line <span className="font-mono">{firstChanged + 1}</span>
          </p>
        ) : null}
      </div>
      <CodeBlock label="Input" text={input} copyLabel="Copy input" maxHeightClassName="max-h-40" />
      <div className="grid gap-3 md:grid-cols-2">
        <DiffColumn
          title="Expected output"
          text={expectedOutput}
          lines={expected}
          changed={changed}
          side="expected"
        />
        <DiffColumn
          title="Your output"
          text={actualOutput}
          lines={actual}
          changed={changed}
          side="actual"
        />
      </div>
      {stderr ? (
        <CodeBlock label="stderr" text={stderr} tone="danger" maxHeightClassName="max-h-40" />
      ) : null}
    </section>
  );
}
