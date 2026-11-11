import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type To } from 'react-router';
import { cn } from '@/lib/cn';
import { buttonStyles, type ButtonSize, type ButtonVariant } from './button-styles';
import { useFloatingPosition } from './floating';

interface MenuContextValue {
  close: (restoreFocus?: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenu(): MenuContextValue {
  const context = use(MenuContext);
  if (!context) throw new Error('Menu items must be used inside <DropdownMenu>');
  return context;
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'),
  );
}

export interface DropdownMenuProps {
  /** Content of the trigger button (text, avatar, icon). */
  trigger: ReactNode;
  /** aria-label for the trigger when its content is not descriptive text. */
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  /** Square trigger for a single icon. */
  iconOnly?: boolean;
  /** Menu alignment to the trigger (default end = right edges line up). */
  align?: 'start' | 'end';
  /** MenuItem, MenuLink, MenuSeparator and MenuLabel. */
  children: ReactNode;
  className?: string;
}

/**
 * Menu button (WAI-ARIA menu pattern): Enter/Space/ArrowDown open and focus the first item,
 * ArrowUp the last; arrows/Home/End move; Escape closes and refocuses the trigger; Tab and
 * outside clicks close. The menu is portalled, so overflow containers never clip it.
 */
export function DropdownMenu({
  trigger,
  triggerLabel,
  triggerVariant = 'ghost',
  triggerSize = 'md',
  triggerClassName,
  iconOnly = false,
  align = 'end',
  children,
  className,
}: DropdownMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [initialItem, setInitialItem] = useState<'first' | 'last'>('first');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { style } = useFloatingPosition(open, triggerRef, menuRef, {
    side: 'bottom',
    align,
    offset: 6,
  });

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (initialItem === 'first' ? items[0] : items.at(-1))?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, initialItem]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setInitialItem(event.key === 'ArrowDown' ? 'first' : 'last');
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current);
    const index = items.findIndex((item) => item === document.activeElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items.at(-1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    } else if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <MenuContext value={{ close }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={triggerLabel}
        onClick={() => {
          setInitialItem('first');
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
        className={buttonStyles({
          variant: triggerVariant,
          size: triggerSize,
          iconOnly,
          className: triggerClassName,
        })}
      >
        {trigger}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={`${id}-menu`}
              role="menu"
              aria-label={triggerLabel}
              style={style}
              onKeyDown={onMenuKeyDown}
              className={cn(
                'z-50 min-w-48 rounded-control border border-border bg-surface p-1 shadow-xl shadow-black/10 animate-slide-down dark:bg-raised dark:shadow-black/50',
                className,
              )}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </MenuContext>
  );
}

// Keyboard focus gets a clearly visible violet tint (hover stays neutral).
const ITEM_CLASS =
  'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors ' +
  'hover:bg-raised dark:hover:bg-raised-hover focus-visible:bg-primary-soft focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export interface MenuItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Right-aligned hint, e.g. a shortcut. */
  hint?: ReactNode;
  children: ReactNode;
}

/** A menu action (closes the menu, then calls onSelect). */
export function MenuItem({
  onSelect,
  icon,
  tone = 'default',
  disabled = false,
  hint,
  children,
}: MenuItemProps) {
  const { close } = useMenu();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        close(true);
        onSelect();
      }}
      className={cn(ITEM_CLASS, tone === 'danger' ? 'text-danger' : 'text-foreground')}
    >
      {icon ? (
        <span className={tone === 'danger' ? 'text-danger' : 'text-muted'}>{icon}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="ml-4 text-xs text-muted">{hint}</span> : null}
    </button>
  );
}

export interface MenuLinkProps {
  to: To;
  icon?: ReactNode;
  children: ReactNode;
}

/** A menu item that navigates (React Router link). */
export function MenuLink({ to, icon, children }: MenuLinkProps) {
  const { close } = useMenu();
  return (
    <Link
      to={to}
      role="menuitem"
      tabIndex={-1}
      onClick={() => close(false)}
      className={cn(ITEM_CLASS, 'text-foreground')}
    >
      {icon ? <span className="text-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border" />;
}

export function MenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="presentation" className={cn('px-2.5 py-1.5 text-xs text-muted', className)}>
      {children}
    </div>
  );
}
