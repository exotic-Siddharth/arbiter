import { CircleAlert, RotateCcw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { getErrorMessage, isApiError } from '@/lib/http';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Call to action (ButtonLink, Button). */
  action?: ReactNode;
  /** Less padding, for cards and table bodies. */
  compact?: boolean;
  className?: string;
}

/** "Nothing here yet" state for lists, tables and panels. */
export function EmptyState({ icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center rounded-full border border-border bg-raised text-muted',
            compact ? 'mb-1 size-10 [&_svg]:size-5' : 'mb-1 size-12 [&_svg]:size-6',
          )}
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  /** The failed query's error; its message is shown. */
  error?: unknown;
  title?: ReactNode;
  /** Shows a "Try again" button (e.g. query.refetch). */
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

/** Error state for a failed data view, with an optional retry. */
export function ErrorState({
  error,
  title,
  onRetry,
  retrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  const offline = isApiError(error) && error.isNetworkError;
  const notFound = isApiError(error) && error.status === 404;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mb-1 flex size-11 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger [&_svg]:size-5"
      >
        {offline ? <WifiOff /> : <CircleAlert />}
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">
        {title ?? (offline ? "Can't reach the server" : notFound ? 'Not found' : "Couldn't load this")}
      </h3>
      <p className="max-w-md text-sm text-muted">
        {getErrorMessage(error, 'Something went wrong while loading. Please try again.')}
      </p>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          leftIcon={<RotateCcw />}
          loading={retrying}
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
