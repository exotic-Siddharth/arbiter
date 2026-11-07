/** Shared classes for text-like form controls (Input, Textarea, Select). */
export const CONTROL_BASE =
  'w-full min-w-0 rounded-control border border-border bg-surface text-foreground shadow-xs ' +
  'transition-[color,border-color,box-shadow] duration-150 placeholder:text-muted ' +
  'hover:border-border-strong focus-visible:border-primary focus-visible:outline-none ' +
  'focus-visible:ring-3 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25 dark:bg-background';

export type ControlSize = 'sm' | 'md' | 'lg';

export const CONTROL_SIZES: Record<ControlSize, string> = {
  sm: 'h-8 px-2.5 text-[13px]',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-3.5 text-[15px]',
};
