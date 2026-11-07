import { use, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { PageNestingContext } from './page-context';

const WIDTHS = {
  narrow: 'max-w-md',
  prose: 'max-w-3xl',
  default: 'max-w-7xl',
  full: 'max-w-none',
} as const;

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small line above the title (breadcrumb link, section name). */
  eyebrow?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  className?: string;
}

/** Page heading (h1) with description and actions. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <div className="text-[13px] font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export interface PageProps {
  /** h1 text and the tab title ("<title> · Arbiter"). */
  title: string;
  /** Tab title when it should differ from the heading. */
  documentTitle?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** narrow 28rem (auth forms) | prose 48rem | default 80rem | full */
  width?: keyof typeof WIDTHS;
  /** Keep the h1 for screen readers but hide it visually (custom hero layouts). */
  hideHeader?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Standard page frame inside the AppShell: centred container, PageHeader, document title and
 * consistent vertical rhythm. Workspace-style pages that fill the viewport skip it and call
 * useDocumentTitle() themselves.
 */
export function Page({
  title,
  documentTitle,
  description,
  eyebrow,
  actions,
  width = 'default',
  hideHeader = false,
  className,
  children,
}: PageProps) {
  useDocumentTitle(documentTitle ?? title);
  const nested = use(PageNestingContext) === 'nested';
  return (
    <div
      className={cn(
        'w-full',
        nested ? 'space-y-6' : cn('mx-auto space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8', WIDTHS[width]),
        className,
      )}
    >
      {hideHeader ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <PageHeader title={title} description={description} eyebrow={eyebrow} actions={actions} />
      )}
      {children}
    </div>
  );
}
