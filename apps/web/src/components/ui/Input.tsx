import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_BASE, CONTROL_SIZES, type ControlSize } from './control-styles';
import { Field } from './Field';

export interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelAction?: ReactNode;
  size?: ControlSize;
  /** Icon inside the left edge (e.g. a search glass). */
  leftIcon?: ReactNode;
  /** Element inside the right edge (clear button, unit, Kbd hint). */
  rightSlot?: ReactNode;
  /** Classes for the wrapper (label + control + messages). */
  containerClassName?: string;
}

/**
 * Text input with label, hint and error wired for screen readers. Without a visible label pass
 * aria-label (e.g. a search box).
 */
export function Input({
  label,
  hint,
  error,
  labelAction,
  size = 'md',
  leftIcon,
  rightSlot,
  containerClassName,
  className,
  id,
  required,
  'aria-describedby': describedBy,
  ...props
}: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      required={required}
      id={id}
      describedBy={describedBy}
      className={containerClassName}
    >
      {(control) => (
        <div className="relative flex items-center">
          {leftIcon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 flex text-muted [&_svg]:size-4"
            >
              {leftIcon}
            </span>
          ) : null}
          <input
            {...control}
            className={cn(
              CONTROL_BASE,
              CONTROL_SIZES[size],
              leftIcon && 'pl-9',
              rightSlot && 'pr-10',
              'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium',
              className,
            )}
            {...props}
          />
          {rightSlot ? (
            <span className="absolute right-1.5 flex items-center text-muted">{rightSlot}</span>
          ) : null}
        </div>
      )}
    </Field>
  );
}
