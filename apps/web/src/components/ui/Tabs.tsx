import {
  createContext,
  use,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

type TabsVariant = 'underline' | 'pills';

interface TabsContextValue {
  value: string;
  select: (value: string) => void;
  baseId: string;
  variant: TabsVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = use(TabsContext);
  if (!context) throw new Error(`<${component}> must be used inside <Tabs>`);
  return context;
}

const safeId = (value: string) => value.replace(/[^\w-]/g, '_');

export interface TabsProps {
  /** Controlled value (pair with onValueChange), e.g. synced to a URL search param. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** underline (default, page sections) | pills (segmented control, filters). */
  variant?: TabsVariant;
  className?: string;
  children: ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): roving tabindex, Left/Right/Home/End, automatic
 * activation. Compose with TabsList > TabsTrigger and TabsContent.
 */
export function Tabs({
  value,
  defaultValue = '',
  onValueChange,
  variant = 'underline',
  className,
  children,
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    if (next !== current) onValueChange?.(next);
  };
  return (
    <TabsContext value={{ value: current, select, baseId, variant }}>
      <div className={className}>{children}</div>
    </TabsContext>
  );
}

export interface TabsListProps extends ComponentProps<'div'> {
  /** Required unless the list is labelled another way (aria-labelledby). */
  'aria-label'?: string;
}

export function TabsList({ className, children, onKeyDown, ...props }: TabsListProps) {
  const { variant } = useTabs('TabsList');

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === -1) return;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        variant === 'underline'
          ? 'flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-none'
          : 'inline-flex items-center gap-0.5 rounded-control border border-border bg-raised p-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends Omit<ComponentProps<'button'>, 'value'> {
  value: string;
  icon?: ReactNode;
  /** Small count after the label (e.g. number of submissions). */
  count?: ReactNode;
}

export function TabsTrigger({
  value,
  icon,
  count,
  className,
  children,
  disabled,
  onClick,
  ...props
}: TabsTriggerProps) {
  const { value: current, select, baseId, variant } = useTabs('TabsTrigger');
  const selected = current === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${safeId(value)}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${safeId(value)}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) select(value);
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'underline'
          ? cn(
              '-mb-px h-10 border-b-2 px-3 text-sm',
              selected
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted hover:border-border-strong hover:text-foreground',
            )
          : cn(
              'h-7 rounded-[6px] px-3 text-[13px]',
              selected
                ? 'bg-surface text-foreground shadow-sm dark:bg-raised-hover'
                : 'text-muted hover:text-foreground',
            ),
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && count !== null ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums',
            selected ? 'bg-primary-soft text-primary-text' : 'bg-raised text-muted',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export interface TabsContentProps extends ComponentProps<'div'> {
  value: string;
  /** Keep the panel mounted (hidden) while inactive, preserving its state. */
  keepMounted?: boolean;
}

export function TabsContent({ value, keepMounted = false, className, children, ...props }: TabsContentProps) {
  const { value: current, baseId } = useTabs('TabsContent');
  const selected = current === value;
  if (!selected && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${safeId(value)}`}
      aria-labelledby={`${baseId}-tab-${safeId(value)}`}
      hidden={!selected}
      tabIndex={0}
      className={cn('rounded-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}
