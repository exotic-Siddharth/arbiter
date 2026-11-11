import { useDeferredValue, useId, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface MarkdownEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  maxLength?: number;
  /** Textarea height in rows (default 18). */
  rows?: number;
  placeholder?: string;
}

type Mode = 'write' | 'preview';

/**
 * Markdown source with a live preview: side by side from lg up, a Write / Preview switch on
 * smaller screens. The preview renders a deferred copy of the text so typing stays smooth on
 * long statements.
 */
export function MarkdownEditor({
  label,
  value,
  onChange,
  error,
  hint,
  maxLength,
  rows = 18,
  placeholder,
}: MarkdownEditorProps) {
  const id = useId();
  const [mode, setMode] = useState<Mode>('write');
  const deferred = useDeferredValue(value);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <div
          role="group"
          aria-label="Editor view"
          className="flex rounded-control bg-raised p-0.5 lg:hidden"
        >
          {(['write', 'preview'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                'rounded-[6px] px-3 py-1 text-xs font-medium capitalize transition-colors',
                mode === item
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(mode === 'write' ? 'block' : 'hidden lg:block')}>
          <textarea
            id={id}
            value={value}
            rows={rows}
            spellCheck={false}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'block w-full resize-y rounded-control border bg-surface px-3 py-2.5 font-mono text-[13px] leading-relaxed text-foreground shadow-sm placeholder:text-muted/70',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              error ? 'border-danger' : 'border-border hover:border-border-strong',
            )}
          />
        </div>
        <div
          className={cn(
            'min-h-40 overflow-auto rounded-control border border-border bg-background/40 px-4 py-3 scrollbar-thin lg:max-h-[32rem]',
            mode === 'preview' ? 'block' : 'hidden lg:block',
          )}
          aria-label={`${label} preview`}
          role="region"
        >
          {deferred.trim() ? (
            <Markdown source={deferred} />
          ) : (
            <p className="text-sm text-muted">The preview appears here as you type.</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="min-w-0 space-y-0.5">
          {error ? (
            <p id={errorId} role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
          {hint ? (
            <p id={hintId} className="text-muted">
              {hint}
            </p>
          ) : null}
        </div>
        {maxLength ? (
          <span
            className={cn('tabular-nums', value.length > maxLength ? 'text-danger' : 'text-muted')}
          >
            {formatNumber(value.length)} / {formatNumber(maxLength)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
