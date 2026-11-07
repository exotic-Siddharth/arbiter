import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Props a labelled control needs; spread them onto the input/select/editor. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps {
  /** Visible label (rendered as <label for=id>). */
  label?: ReactNode;
  /** Help text under the control (linked with aria-describedby). */
  hint?: ReactNode;
  /** Error message: marks the control aria-invalid and links the message. */
  error?: ReactNode;
  required?: boolean;
  /** Small element right of the label, e.g. a "Forgot?" link or a character count. */
  labelAction?: ReactNode;
  /** Control id; generated when omitted. */
  id?: string;
  /** Extra ids for aria-describedby. */
  describedBy?: string;
  className?: string;
  /** Render the control with the wiring props: {(props) => <input {...props} />} */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + error wiring for any control (Input/Textarea/Select use it; use it directly for
 * custom controls such as a CodeEditor in a form).
 */
export function Field({
  label,
  hint,
  error,
  required,
  labelAction,
  id,
  describedBy,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const ariaDescribedBy = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = children({
    id: controlId,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': error ? true : undefined,
    required,
  });

  if (!label && !hint && !error && !labelAction) {
    return className ? <div className={className}>{control}</div> : <>{control}</>;
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label || labelAction ? (
        <div className="flex min-h-5 items-center justify-between gap-2">
          {label ? (
            <label htmlFor={controlId} className="text-[13px] font-medium text-foreground">
              {label}
              {required ? (
                <span aria-hidden="true" className="ml-0.5 text-danger">
                  *
                </span>
              ) : null}
            </label>
          ) : (
            <span />
          )}
          {labelAction ? <div className="text-xs text-muted">{labelAction}</div> : null}
        </div>
      ) : null}
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
