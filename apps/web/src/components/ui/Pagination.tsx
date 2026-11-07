import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { buttonStyles } from './button-styles';

function pageItems(page: number, pageCount: number, siblings: number): (number | 'gap')[] {
  const total = siblings * 2 + 5; // first, last, current, 2 gaps
  if (pageCount <= total) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.max(2, page - siblings);
  const end = Math.min(pageCount - 1, page + siblings);
  const items: (number | 'gap')[] = [1];
  if (start > 2) items.push(start === 3 ? 2 : 'gap');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pageCount - 1) items.push(end === pageCount - 2 ? pageCount - 1 : 'gap');
  items.push(pageCount);
  return items;
}

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total number of items (the API's `total`). */
  total: number;
  onPageChange: (page: number) => void;
  /** Page buttons on each side of the current one (default 1). */
  siblingCount?: number;
  /** "Showing 21–40 of 312 problems" (default true). */
  showSummary?: boolean;
  /** Noun for the summary (default "results"). */
  itemLabel?: string;
  className?: string;
}

/** Page navigation for paged API lists ({items, total, page, pageSize}). */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  siblingCount = 1,
  showSummary = true,
  itemLabel = 'results',
  className,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const go = (target: number) => {
    if (target >= 1 && target <= pageCount && target !== current) onPageChange(target);
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-col items-center justify-between gap-3 sm:flex-row', className)}
    >
      {showSummary ? (
        <p className="text-[13px] text-muted">
          {total === 0 ? (
            `No ${itemLabel}`
          ) : (
            <>
              Showing{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatNumber(from)}–{formatNumber(to)}
              </span>{' '}
              of <span className="font-medium text-foreground tabular-nums">{formatNumber(total)}</span>{' '}
              {itemLabel}
            </>
          )}
        </p>
      ) : (
        <span />
      )}
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current <= 1}
            className={buttonStyles({ variant: 'ghost', size: 'sm', className: 'px-2' })}
          >
            <ChevronLeft aria-hidden="true" />
            <span>Previous</span>
          </button>
          <ul className="hidden items-center gap-1 sm:flex">
            {pageItems(current, pageCount, siblingCount).map((item, index) =>
              item === 'gap' ? (
                <li key={`gap-${index}`} aria-hidden="true" className="w-8 text-center text-muted">
                  …
                </li>
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => go(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === current ? 'page' : undefined}
                    className={buttonStyles({
                      variant: item === current ? 'secondary' : 'ghost',
                      size: 'sm',
                      className: cn(
                        'min-w-8 px-2 font-mono text-[13px] tabular-nums',
                        item === current && 'border-primary/40 text-primary-text',
                      ),
                    })}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ul>
          <span className="px-2 text-[13px] text-muted tabular-nums sm:hidden">
            {current} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current >= pageCount}
            className={buttonStyles({ variant: 'ghost', size: 'sm', className: 'px-2' })}
          >
            <span>Next</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
