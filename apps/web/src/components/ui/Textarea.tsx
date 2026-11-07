import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_BASE } from './control-styles';
import { Field } from './Field';

export interface TextareaProps extends ComponentProps<'textarea'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelAction?: ReactNode;
  /** Monospace text for program input/output and test data. */
  mono?: boolean;
  containerClassName?: string;
}

/** Multi-line text input with label, hint and error. */
export function Textarea({
  label,
  hint,
  error,
  labelAction,
  mono = false,
  containerClassName,
  className,
  id,
  required,
  'aria-describedby': describedBy,
  ...props
}: TextareaProps) {
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
        <textarea
          {...control}
          className={cn(
            CONTROL_BASE,
            'min-h-24 resize-y px-3 py-2 text-sm leading-relaxed scrollbar-thin',
            mono && 'font-mono text-[13px] leading-6',
            className,
          )}
          {...props}
        />
      )}
    </Field>
  );
}
