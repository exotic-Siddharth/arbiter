import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends ComponentProps<'div'> {
  /** Hover affordance for cards that are links or buttons. */
  interactive?: boolean;
}

/** Surface container: 10 px radius, 1 px border, no heavy shadow (spec 13.1). */
export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface',
        interactive &&
          'transition-colors duration-150 hover:border-border-strong hover:bg-raised/40',
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends Omit<ComponentProps<'div'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (buttons, links, filters). */
  actions?: ReactNode;
  /** Bottom border between header and content. */
  divider?: boolean;
}

/** Card header with optional title, description and actions. */
export function CardHeader({
  title,
  description,
  actions,
  divider = false,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5',
        divider ? 'border-b border-border pb-4' : 'pb-1',
        className,
      )}
      {...props}
    >
      {title || description ? (
        <div className="min-w-0 space-y-1">
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      ) : null}
      {children}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('text-[15px] font-semibold leading-snug tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-border px-5 py-3', className)}
      {...props}
    />
  );
}
