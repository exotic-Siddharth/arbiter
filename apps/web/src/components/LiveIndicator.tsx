import { cn } from '@/lib/cn';
import { useSocketStatus } from '@/lib/socket';

export interface LiveIndicatorProps {
  /** Label while connected (default "Live"). */
  label?: string;
  className?: string;
}

/** Realtime connection status: pulsing green "Live", amber "Reconnecting…", grey "Offline". */
export function LiveIndicator({ label = 'Live', className }: LiveIndicatorProps) {
  const status = useSocketStatus();
  const text = status === 'connected' ? label : status === 'connecting' ? 'Reconnecting…' : 'Offline';
  const color =
    status === 'connected'
      ? 'var(--color-success)'
      : status === 'connecting'
        ? 'var(--color-warning)'
        : 'var(--color-muted)';
  return (
    <span
      role="status"
      aria-live="polite"
      data-status={status}
      style={{ color }}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
    >
      <span aria-hidden="true" className="relative flex size-2">
        {status === 'connected' ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
        ) : null}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {text}
    </span>
  );
}
