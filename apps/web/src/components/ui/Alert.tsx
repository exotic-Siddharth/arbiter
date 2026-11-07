import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<AlertTone, { color: string; icon: ReactNode }> = {
  info: { color: 'var(--color-info)', icon: <Info /> },
  success: { color: 'var(--color-success)', icon: <CircleCheck /> },
  warning: { color: 'var(--color-warning)', icon: <TriangleAlert /> },
  danger: { color: 'var(--color-danger)', icon: <CircleAlert /> },
  neutral: { color: 'var(--color-muted)', icon: <Info /> },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replace the default tone icon (null hides it). */
  icon?: ReactNode | null;
  /** Right-aligned action (button/link). */
  action?: ReactNode;
  /** alert (assertive) for danger/warning, status (polite) otherwise; override if needed. */
  role?: 'alert' | 'status' | 'none';
  className?: string;
}

/** Inline callout: form errors, "Judge unavailable", notices. */
export function Alert({ tone = 'info', title, children, icon, action, role, className }: AlertProps) {
  const config = TONES[tone];
  const resolvedRole = role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole === 'none' ? undefined : resolvedRole}
      style={{ '--alert-color': config.color } as CSSProperties}
      className={cn(
        'flex items-start gap-3 rounded-control border border-(--alert-color)/30 bg-(--alert-color)/8 px-3.5 py-3 text-sm',
        className,
      )}
    >
      {icon === null ? null : (
        <span aria-hidden="true" className="mt-px flex text-(--alert-color) [&_svg]:size-4">
          {icon ?? config.icon}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        {children ? <div className="text-muted [&_a]:text-primary-text [&_a]:underline">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
