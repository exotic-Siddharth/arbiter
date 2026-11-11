import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
  containerClassName?: string;
}

/** Native checkbox in the primary colour, with an optional label and description. */
export function Checkbox({
  label,
  description,
  containerClassName,
  className,
  id,
  disabled,
  ...props
}: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const input = (
    <input
      id={inputId}
      type="checkbox"
      disabled={disabled}
      aria-describedby={descriptionId}
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-[4px] accent-primary disabled:cursor-not-allowed',
        label ? 'mt-0.5' : null,
        className,
      )}
      {...props}
    />
  );
  if (!label) return input;
  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-60', containerClassName)}>
      {input}
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className={cn('text-sm text-foreground', !disabled && 'cursor-pointer')}
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
