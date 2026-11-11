import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface CodeBlockProps {
  /** Small heading above the block, e.g. "Input" or "stderr". */
  label?: ReactNode;
  /** Right side of the heading row (badges, counts). */
  meta?: ReactNode;
  text: string;
  /** Accessible label of the copy button; omit to hide it. */
  copyLabel?: string;
  /** Shown instead of an empty block. */
  emptyText?: string;
  tone?: 'default' | 'danger';
  /** Tailwind max-height class (default max-h-64). */
  maxHeightClassName?: string;
  className?: string;
}

/** Monospace program text (sample input, stdout, stderr, compile output) with a copy button. */
export function CodeBlock({
  label,
  meta,
  text,
  copyLabel,
  emptyText = '(empty)',
  tone = 'default',
  maxHeightClassName = 'max-h-64',
  className,
}: CodeBlockProps) {
  const empty = text.length === 0;
  return (
    <div className={cn('min-w-0', className)}>
      {label || meta || copyLabel ? (
        <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted">
            {label}
            {meta}
          </div>
          {copyLabel && !empty ? <CopyButton text={text} label={copyLabel} size="xs" /> : null}
        </div>
      ) : null}
      <pre
        className={cn(
          'overflow-auto rounded-control border px-3 py-2.5 font-mono text-[13px] leading-5 whitespace-pre scrollbar-thin',
          maxHeightClassName,
          tone === 'danger'
            ? 'border-danger/30 bg-danger/5 text-foreground'
            : 'border-border bg-raised/60 text-foreground',
          empty && 'text-muted italic',
        )}
      >
        {empty ? emptyText : text}
      </pre>
    </div>
  );
}
