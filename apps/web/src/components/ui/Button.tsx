import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';
import type { Side } from './floating';

export interface ButtonProps extends ComponentProps<'button'> {
  /** primary (violet, default) | secondary | outline | ghost | danger */
  variant?: ButtonVariant;
  /** xs 28 px | sm 32 px | md 36 px (default) | lg 44 px */
  size?: ButtonSize;
  /** Shows a spinner (in place of leftIcon), disables the button and sets aria-busy. */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/** Button; defaults to type="button" (pass type="submit" in forms). */
export function Button({
  variant,
  size,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/** React Router <Link> styled as a Button (CTAs such as "Start solving"). */
export function ButtonLink({
  variant,
  size,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonStyles({ variant, size, fullWidth, className: className as string | undefined })}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leftIcon' | 'rightIcon'> {
  /** Accessible name (aria-label) and tooltip text. Required: the button has no visible text. */
  label: string;
  icon: ReactNode;
  /** Show `label` as a tooltip (default true). */
  tooltip?: boolean;
  tooltipSide?: Side;
}

/** Square icon-only button with an aria-label and a matching tooltip. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  tooltip = true,
  tooltipSide = 'top',
  loading = false,
  className,
  disabled,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, iconOnly: true, className })}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
