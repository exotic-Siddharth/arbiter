import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from './Button';

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[hidden], [inert]') && element.tabIndex >= 0,
  );
}

/** Open dialogs, innermost last: only the top one handles Escape. */
const dialogStack: string[] = [];
let scrollLockCount = 0;
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null;

function lockScroll(): void {
  scrollLockCount += 1;
  if (scrollLockCount > 1) return;
  const { body, documentElement } = document;
  savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  const scrollbar = window.innerWidth - documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  document.getElementById('root')?.setAttribute('inert', '');
}

function unlockScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount > 0) return;
  const { body } = document;
  body.style.overflow = savedBodyStyle?.overflow ?? '';
  body.style.paddingRight = savedBodyStyle?.paddingRight ?? '';
  savedBodyStyle = null;
  document.getElementById('root')?.removeAttribute('inert');
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(96vw,1400px)]',
} as const;

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name (rendered as the heading). */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action row, right-aligned (Cancel / Save). */
  footer?: ReactNode;
  /** sm 28rem | md 32rem (default) | lg 42rem | xl 56rem | full ~96vw */
  size?: keyof typeof SIZES;
  /** Element to focus on open (default: first focusable control in the body). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Escape, overlay click and the close button close the dialog (default true). */
  dismissible?: boolean;
  hideCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * Modal dialog: portalled to <body>, role="dialog" aria-modal, labelled by its title and
 * described by its description. Focus moves inside on open, Tab is trapped, Escape closes,
 * the page behind is inert and does not scroll, and focus returns to the opener on close.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  dismissible = true,
  hideCloseButton = false,
  className,
  bodyClassName,
}: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(id);
    lockScroll();

    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ?? (panel ? focusableIn(panel)[0] : undefined) ?? panel;
    target?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || dialogStack.at(-1) !== id) return;
      event.preventDefault();
      if (dismissibleRef.current) onOpenChangeRef.current(false);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = dialogStack.lastIndexOf(id);
      if (index !== -1) dialogStack.splice(index, 1);
      unlockScroll();
      // Return focus once the dialog has left the DOM.
      if (opener?.isConnected) setTimeout(() => opener.focus(), 0);
    };
  }, [open, id, initialFocusRef]);

  if (!open) return null;

  const hasBody = children !== undefined && children !== null && children !== false;
  const trapTab =(event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-overlay backdrop-blur-[2px] animate-fade-in"
        onClick={() => {
          if (dismissible) onOpenChange(false);
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn(
          'relative flex max-h-[min(88dvh,900px)] w-full flex-col overflow-hidden rounded-card border border-border bg-surface shadow-2xl shadow-black/20 outline-none animate-scale-in dark:shadow-black/60',
          SIZES[size],
          className,
        )}
      >
        <div
          className={cn(
            'px-5 pt-5',
            hasBody ? 'pb-1' : 'pb-5',
            hideCloseButton ? null : 'pr-12',
          )}
        >
          <h2 id={titleId} className="text-base font-semibold leading-snug tracking-tight">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {hasBody ? (
          <div
            className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin', bodyClassName)}
          >
            {children}
          </div>
        ) : null}
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-raised/40 px-5 py-3">
            {footer}
          </div>
        ) : null}
        {hideCloseButton ? null : (
          <button
            type="button"
            aria-label="Close"
            disabled={!dismissible}
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button (deletes, irreversible actions). */
  tone?: 'primary' | 'danger';
  /**
   * Runs on confirm. While its promise is pending the buttons are disabled; it closes the
   * dialog when it resolves and keeps it open when it rejects (show the error yourself, e.g.
   * with toastError).
   */
  onConfirm: () => unknown;
}

/** "Are you sure?" dialog with an async confirm action. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Stay open; the caller reports the error.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
