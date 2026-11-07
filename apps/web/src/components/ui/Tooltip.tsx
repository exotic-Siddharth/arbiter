import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFloatingPosition, type Side } from './floating';

export interface TooltipProps {
  /** Short supplementary text. Never put the only label of a control here: use aria-label. */
  content: ReactNode;
  /** One focusable element (it gets aria-describedby while the tooltip shows). */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: Side;
  /** Hover delay in ms (keyboard focus shows immediately). */
  delay?: number;
  disabled?: boolean;
  className?: string;
  /** Classes for the inline wrapper around the trigger. */
  triggerClassName?: string;
}

function isKeyboardFocus(event: FocusEvent<HTMLElement>): boolean {
  try {
    return (event.target as HTMLElement).matches(':focus-visible');
  } catch {
    return true;
  }
}

/** Hover/focus tooltip (role="tooltip"), portalled to <body>; Esc dismisses it. */
export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 350,
  disabled = false,
  className,
  triggerClassName,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { style } = useFloatingPosition(open, triggerRef, tooltipRef, { side, offset: 6 });

  const show = (wait: number) => {
    if (disabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), wait);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const describedBy = [children.props['aria-describedby'], open ? id : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex', triggerClassName)}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') show(delay);
        }}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={(event) => {
          if (isKeyboardFocus(event)) show(0);
        }}
        onBlur={hide}
      >
        {cloneElement(children, { 'aria-describedby': describedBy || undefined })}
      </span>
      {open && !disabled
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              style={style}
              className={cn(
                'pointer-events-none z-[60] max-w-xs rounded-md border border-border bg-raised px-2 py-1 text-xs font-medium text-foreground shadow-lg shadow-black/10 animate-fade-in dark:shadow-black/40',
                className,
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
