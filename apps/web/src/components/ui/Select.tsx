import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_BASE, CONTROL_SIZES, type ControlSize } from './control-styles';
import { Field } from './Field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelAction?: ReactNode;
  size?: ControlSize;
  /** Options (alternatively pass <option> children). */
  options?: readonly SelectOption[];
  /** First option with value "" (e.g. "All difficulties"). */
  placeholder?: string;
  containerClassName?: string;
}

/** Native <select> (keyboard and mobile friendly) styled like the other controls. */
export function Select({
  label,
  hint,
  error,
  labelAction,
  size = 'md',
  options,
  placeholder,
  containerClassName,
  className,
  id,
  required,
  children,
  'aria-describedby': describedBy,
  ...props
}: SelectProps) {
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
          <select
            {...control}
            className={cn(
              CONTROL_BASE,
              CONTROL_SIZES[size],
              'cursor-pointer appearance-none pr-8',
              className,
            )}
            {...props}
          >
            {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
            {options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 size-4 text-muted"
          />
        </div>
      )}
    </Field>
  );
}
