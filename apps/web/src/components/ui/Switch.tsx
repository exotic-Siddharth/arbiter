import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label; without it pass aria-label. */
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/** On/off toggle (role="switch"), e.g. the admin "Published" toggle. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = 'md',
  id,
  'aria-label': ariaLabel,
  className,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const descriptionId = description ? `${switchId}-description` : undefined;
  const small = size === 'sm';

  const control = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        small ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'border-primary bg-primary' : 'border-border-strong bg-raised-hover',
        !label && className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm transition-transform duration-150',
          small ? 'size-3' : 'size-4',
          checked ? (small ? 'translate-x-3' : 'translate-x-4') : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label) return control;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className={cn('flex', small ? 'pt-0.5' : 'pt-px')}>{control}</span>
      <div className="min-w-0">
        <label
          htmlFor={switchId}
          className={cn('text-sm font-medium text-foreground', !disabled && 'cursor-pointer')}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-xs text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
