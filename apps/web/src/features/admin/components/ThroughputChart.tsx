import { useState } from 'react';
import { cn } from '@/lib/cn';
import { niceMax } from '../lib/chartScale';
import { formatNumber, formatTime, pluralize } from '@/lib/format';

export interface ThroughputPoint {
  /** ISO start of the minute. */
  minute: string;
  count: number;
}

const TICK_EVERY = 5;

/** "14:05" (local time). */
const hhmm = (iso: string) => formatTime(iso).slice(0, 5);

/**
 * Judged submissions per minute, last 30 minutes: one column per minute (single series, so no
 * legend; the card title names it). Columns are <= 24 px with a 4 px rounded top and a square
 * foot on one baseline, hairline recessive gridlines, the peak labelled, and a tooltip on hover
 * and keyboard focus. A table view carries every value for screen readers.
 */
export function ThroughputChart({ points }: { points: readonly ThroughputPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const total = points.reduce((sum, point) => sum + point.count, 0);
  const peak = points.reduce(
    (best, point, index) => (point.count > (points[best]?.count ?? 0) ? index : best),
    0,
  );
  const max = niceMax(Math.max(0, ...points.map((point) => point.count)));
  const ticks = [max, max / 2, 0];
  const summary = `${pluralize(total, 'submission')} judged in the last ${points.length} minutes`;

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No throughput data yet.</p>;
  }

  return (
    <figure className="space-y-2" aria-label="Throughput per minute">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span>{summary}</span>
        <button
          type="button"
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
          className="rounded-sm text-xs font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </figcaption>

      {asTable ? (
        <div className="max-h-56 overflow-auto rounded-control border border-border scrollbar-thin">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Submissions judged per minute</caption>
            <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Minute
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Judged
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.minute} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{hhmm(point.minute)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs">
                    {formatNumber(point.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div
            aria-hidden="true"
            className="flex h-40 w-8 shrink-0 flex-col justify-between text-right font-mono text-[11px] leading-none text-muted tabular-nums"
          >
            {ticks.map((tick) => (
              <span key={tick}>{formatNumber(tick)}</span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-40">
              {/* Hairline gridlines at the three ticks; the bottom one is the baseline. */}
              {[0, 50, 100].map((offset) => (
                <div
                  key={offset}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-border"
                  style={{ top: `${offset}%` }}
                />
              ))}
              <ul className="absolute inset-0 flex items-end gap-[2px]" role="list">
                {points.map((point, index) => {
                  const height = max === 0 ? 0 : (point.count / max) * 100;
                  const isActive = active === index;
                  return (
                    <li
                      key={point.minute}
                      className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                    >
                      <button
                        type="button"
                        aria-label={`${hhmm(point.minute)}: ${pluralize(point.count, 'submission')} judged`}
                        onPointerEnter={() => setActive(index)}
                        onPointerLeave={() =>
                          setActive((current) => (current === index ? null : current))
                        }
                        onFocus={() => setActive(index)}
                        onBlur={() => setActive((current) => (current === index ? null : current))}
                        className="group flex h-full w-full items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <span
                          className={cn(
                            'block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity',
                            active !== null && !isActive && 'opacity-55',
                          )}
                          style={{ height: point.count > 0 ? `max(2px, ${height}%)` : 0 }}
                        />
                      </button>
                      {point.count > 0 && index === peak && !isActive ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[11px] font-medium text-foreground"
                          style={{ bottom: `calc(${height}% + 3px)` }}
                        >
                          {point.count}
                        </span>
                      ) : null}
                      {isActive ? (
                        <div
                          role="tooltip"
                          className={cn(
                            'pointer-events-none absolute bottom-full z-10 mb-1 w-max rounded-control border border-border-strong bg-raised px-2.5 py-1.5 text-xs shadow-lg',
                            index > points.length / 2 ? 'right-0' : 'left-0',
                          )}
                          style={{ bottom: `calc(${height}% + 6px)` }}
                        >
                          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                            {formatNumber(point.count)}
                            <span className="ml-1 font-sans text-xs font-normal text-muted">
                              judged
                            </span>
                          </p>
                          <p className="text-muted">{hhmm(point.minute)}</p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div aria-hidden="true" className="mt-1.5 flex gap-[2px] text-[11px] text-muted">
              {points.map((point, index) => (
                <span key={point.minute} className="relative min-w-0 flex-1">
                  {index % TICK_EVERY === 0 ? (
                    <span className="absolute left-0 -translate-x-1/4 whitespace-nowrap font-mono tabular-nums">
                      {hhmm(point.minute)}
                    </span>
                  ) : null}
                </span>
              ))}
              <span className="h-4" />
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}
