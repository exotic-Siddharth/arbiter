import { Fragment, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { formatHotkey } from '@/lib/keyboard';

/** One key cap: <Kbd>Esc</Kbd>. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border border-b-2 bg-raised px-1.5 font-mono text-[11px] font-medium leading-none text-muted',
        className,
      )}
      {...props}
    />
  );
}

export interface ShortcutProps {
  /** A combo such as "Mod+Enter" (Mod = ⌘ on macOS, Ctrl elsewhere) or explicit keys. */
  keys: string | readonly string[];
  className?: string;
}

/** A key combination: <Shortcut keys="Mod+Enter" /> renders Ctrl + Enter (⌘ Enter on macOS). */
export function Shortcut({ keys, className }: ShortcutProps) {
  const parts = typeof keys === 'string' ? formatHotkey(keys) : keys;
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {parts.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 ? (
            <span aria-hidden="true" className="px-px text-[10px] text-muted">
              +
            </span>
          ) : null}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}
