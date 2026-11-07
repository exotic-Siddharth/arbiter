import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';

export interface TableProps extends ComponentProps<'table'> {
  /** Classes for the horizontally scrolling wrapper. */
  containerClassName?: string;
}

/**
 * Data table. Compose Table > THead/TBody > Tr > Th/Td. Wide tables scroll horizontally inside
 * their wrapper; put it in a <Card> for the standard framed look.
 */
export function Table({ className, containerClassName, ...props }: TableProps) {
  return (
    <div className={cn('relative w-full overflow-x-auto scrollbar-thin', containerClassName)}>
      <table className={cn('w-full border-collapse text-sm tabular-nums', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('border-b border-border', className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&>tr:last-child]:border-b-0', className)} {...props} />;
}

export interface TrProps extends ComponentProps<'tr'> {
  /** Hover highlight (rows that contain a link). */
  interactive?: boolean;
  selected?: boolean;
}

export function Tr({ interactive = false, selected = false, className, ...props }: TrProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'border-b border-border transition-colors duration-150',
        interactive && 'hover:bg-raised/60',
        selected && 'bg-primary-soft',
        className,
      )}
      {...props}
    />
  );
}

type Align = 'left' | 'center' | 'right';
const ALIGN: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export interface ThProps extends ComponentProps<'th'> {
  align?: Align;
  /** Renders the header as a sort button. */
  sortable?: boolean;
  /** Current sort of this column (sets aria-sort). */
  sorted?: 'asc' | 'desc' | false;
  /** Called when the sort button is pressed (toggle the order yourself). */
  onSort?: () => void;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

/** Header cell, optionally a sort button with aria-sort. */
export function Th({
  align,
  sortable = false,
  sorted = false,
  onSort,
  numeric = false,
  className,
  children,
  scope = 'col',
  ...props
}: ThProps) {
  const alignment = align ?? (numeric ? 'right' : 'left');
  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th
      scope={scope}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
      className={cn(
        'h-10 whitespace-nowrap px-4 align-middle text-xs font-medium uppercase tracking-wide text-muted first:pl-5 last:pr-5',
        ALIGN[alignment],
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            '-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 uppercase tracking-wide transition-colors hover:bg-raised hover:text-foreground',
            sorted && 'text-foreground',
            alignment === 'right' && 'flex-row-reverse',
          )}
        >
          {children}
          <SortIcon aria-hidden="true" className={cn('size-3.5', !sorted && 'opacity-50')} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TdProps extends ComponentProps<'td'> {
  align?: Align;
  /** JetBrains Mono, tabular numerals, right-aligned (spec 13.1: numbers in tables). */
  numeric?: boolean;
  /** Muted secondary text. */
  muted?: boolean;
}

export function Td({ align, numeric = false, muted = false, className, ...props }: TdProps) {
  return (
    <td
      className={cn(
        'px-4 py-2.5 align-middle first:pl-5 last:pr-5',
        ALIGN[align ?? (numeric ? 'right' : 'left')],
        numeric && 'whitespace-nowrap font-mono text-[13px] tabular-nums',
        muted && 'text-muted',
        className,
      )}
      {...props}
    />
  );
}

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  /** Render a header row of skeletons too. */
  header?: boolean;
  className?: string;
}

/** Loading placeholder shaped like a table. */
export function TableSkeleton({ rows = 6, columns = 4, header = true, className }: TableSkeletonProps) {
  return (
    <div role="status" aria-label="Loading" className={cn('w-full', className)}>
      {header ? (
        <div className="flex h-10 items-center gap-6 border-b border-border px-5">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={cn('h-3', column === 0 ? 'w-1/4' : 'w-16')} />
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-12 items-center gap-6 border-b border-border px-5 last:border-b-0">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn('h-3.5', column === 0 ? 'w-1/3' : column === columns - 1 ? 'ml-auto w-12' : 'w-20')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
