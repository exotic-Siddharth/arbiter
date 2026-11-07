import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium ' +
  'transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary font-semibold text-on-primary shadow-sm shadow-primary/25 hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'border border-border bg-raised text-foreground hover:border-border-strong hover:bg-raised-hover',
  outline: 'border border-border-strong bg-transparent text-foreground hover:bg-raised',
  ghost: 'bg-transparent text-foreground hover:bg-raised',
  danger:
    'bg-danger-solid font-semibold text-white shadow-sm hover:bg-danger-solid-hover active:bg-danger-solid-hover',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
  sm: 'h-8 px-3 text-[13px] [&_svg]:size-4',
  md: 'h-9 px-4 text-sm [&_svg]:size-4',
  lg: 'h-11 px-5 text-[15px] [&_svg]:size-[18px]',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  xs: 'size-7 [&_svg]:size-3.5',
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-9 [&_svg]:size-[18px]',
  lg: 'size-11 [&_svg]:size-5',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button for a single icon. */
  iconOnly?: boolean;
  fullWidth?: boolean;
  className?: string;
}

/** Button classes, for elements that should look like a Button (links, labels, summaries). */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    BASE,
    VARIANTS[variant],
    iconOnly ? ICON_SIZES[size] : SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}
