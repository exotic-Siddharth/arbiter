import { cn } from '@/lib/cn';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
const PX: Record<SpinnerSize, number> = { xs: 12, sm: 16, md: 20, lg: 28 };

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Accessible label; when set the spinner is a role="status" region. */
  label?: string;
  className?: string;
}

/** Circular loading indicator in the current text colour. */
export function Spinner({ size = 'md', label, className }: SpinnerProps) {
  const px = PX[size];
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={px}
      height={px}
      aria-hidden="true"
      className={cn('shrink-0 animate-spin', className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2.5"
      />
      <path
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="inline-flex items-center">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export interface PageSpinnerProps {
  label?: string;
  className?: string;
}

/** Centered spinner for a whole page or panel. */
export function PageSpinner({ label = 'Loading…', className }: PageSpinnerProps) {
  return (
    <div
      className={cn('flex min-h-[40vh] w-full items-center justify-center text-muted', className)}
    >
      <Spinner size="lg" label={label} />
    </div>
  );
}
