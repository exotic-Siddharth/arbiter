import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatNumber, pluralize } from '@/lib/format';
import { levelFor } from './heatmapScale';

export interface HeatmapDay {
  /** UTC calendar day, "YYYY-MM-DD". */
  date: string;
  count: number;
}

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 30;
const TOP = 18;
const WEEKDAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * One hue (the brand violet), five steps from the surface: level 0 is a faint wash of the text
 * colour so empty days stay visible in both themes, levels 1 to 4 mix the primary colour in.
 */
const LEVEL_FILL = [
  'color-mix(in srgb, var(--color-foreground) 9%, var(--color-surface))',
  'color-mix(in srgb, var(--color-primary) 35%, var(--color-surface))',
  'color-mix(in srgb, var(--color-primary) 58%, var(--color-surface))',
  'color-mix(in srgb, var(--color-primary) 80%, var(--color-surface))',
  'var(--color-primary)',
] as const;

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseDay(key: string): Date {
  return new Date(key + 'T00:00:00Z');
}

function describe(day: HeatmapDay): string {
  const when = dayFormat.format(parseDay(day.date));
  return (day.count === 0 ? 'No submissions' : pluralize(day.count, 'submission')) + ' on ' + when;
}

interface Active {
  index: number;
  x: number;
  y: number;
}

export interface HeatmapProps {
  /** The profile's last 365 UTC days, oldest first. */
  days: readonly HeatmapDay[];
}

/**
 * Submission activity as a 365-day SVG grid (weeks as columns, Sunday on top). Marks use one
 * hue in five steps; each cell has a text label, shows a tooltip on hover and keyboard focus,
 * and the grid is one tab stop that moves with the arrow keys. The legend states the scale
 * (0 to the busiest day).
 */
export function Heatmap({ days }: HeatmapProps) {
  const [focusIndex, setFocusIndex] = useState(Math.max(0, days.length - 1));
  const [active, setActive] = useState<Active | null>(null);
  const cellRefs = useRef<(SVGRectElement | null)[]>([]);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Most recent weeks are the interesting ones when the grid scrolls on small screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const max = days.reduce((best, day) => Math.max(best, day.count), 0);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const startDow = days.length > 0 ? parseDay(days[0]?.date ?? '').getUTCDay() : 0;
  const columns = Math.ceil((days.length + startDow) / 7);
  const width = LEFT + columns * STEP - GAP;
  const height = TOP + 7 * STEP - GAP;

  const months: { label: string; column: number }[] = [];
  days.forEach((day, index) => {
    const date = parseDay(day.date);
    if (index === 0 || date.getUTCDate() === 1) {
      const column = Math.floor((index + startDow) / 7);
      const previous = months.at(-1);
      if (previous && column - previous.column < 3) months.pop();
      months.push({ label: MONTHS[date.getUTCMonth()] ?? '', column });
    }
  });

  const show = (index: number, element: Element) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setActive({
      index,
      x: rect.left - (frame?.left ?? 0) + rect.width / 2,
      y: rect.top - (frame?.top ?? 0),
    });
  };

  const onKeyDown = (event: KeyboardEvent<SVGRectElement>, index: number) => {
    const delta =
      event.key === 'ArrowLeft'
        ? -7
        : event.key === 'ArrowRight'
          ? 7
          : event.key === 'ArrowUp'
            ? -1
            : event.key === 'ArrowDown'
              ? 1
              : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(days.length - 1, Math.max(0, index + delta));
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
  };

  const activeDay = active ? days[active.index] : undefined;
  const frameWidth = frameRef.current?.clientWidth ?? 0;

  return (
    <figure className="space-y-3">
      <div ref={frameRef} className="relative">
        <div ref={scrollRef} className="overflow-x-auto pb-1 scrollbar-thin">
          <svg
            role="group"
            aria-label="Submission activity over the last 365 days"
            viewBox={'0 0 ' + width + ' ' + height}
            style={{ minWidth: Math.min(width, 760) }}
            className="block h-auto w-full max-w-[1040px]"
          >
            {months.map((month) => (
              <text
                key={month.column + month.label}
                x={LEFT + month.column * STEP}
                y={10}
                className="fill-muted text-[10px]"
              >
                {month.label}
              </text>
            ))}
            {Object.entries(WEEKDAY_LABELS).map(([row, label]) => (
              <text
                key={label}
                x={0}
                y={TOP + Number(row) * STEP + CELL - 2}
                className="fill-muted text-[10px]"
              >
                {label}
              </text>
            ))}
            {days.map((day, index) => {
              const slot = index + startDow;
              return (
                <rect
                  key={day.date}
                  ref={(element) => {
                    cellRefs.current[index] = element;
                  }}
                  data-testid="heatmap-cell"
                  data-date={day.date}
                  data-count={day.count}
                  role="img"
                  aria-label={describe(day)}
                  tabIndex={index === focusIndex ? 0 : -1}
                  x={LEFT + Math.floor(slot / 7) * STEP}
                  y={TOP + (slot % 7) * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2.5}
                  fill={LEVEL_FILL[levelFor(day.count, max)]}
                  className="cursor-default stroke-transparent outline-none [stroke-width:1.5px] hover:stroke-foreground/70 focus-visible:stroke-foreground"
                  onPointerEnter={(event) => show(index, event.currentTarget)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={(event) => {
                    setFocusIndex(index);
                    show(index, event.currentTarget);
                  }}
                  onBlur={() => setActive(null)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                />
              );
            })}
          </svg>
        </div>
        {active && activeDay ? (
          <div
            role="tooltip"
            style={{
              left: Math.max(76, Math.min(active.x, frameWidth - 76)),
              top: active.y - 8,
            }}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-control border border-border-strong bg-raised px-2.5 py-1.5 text-center shadow-lg"
          >
            <p className="font-mono text-[13px] font-semibold text-foreground tabular-nums">
              {activeDay.count === 0 ? 'No submissions' : pluralize(activeDay.count, 'submission')}
            </p>
            <p className="text-xs whitespace-nowrap text-muted">
              {dayFormat.format(parseDay(activeDay.date))}
            </p>
          </div>
        ) : null}
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted">
        <span>
          {total === 0 ? (
            'No submissions in the last year'
          ) : (
            <>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatNumber(total)}
              </span>{' '}
              {total === 1 ? 'submission' : 'submissions'} in the last year
            </>
          )}
        </span>
        {max > 0 ? (
          <span data-testid="heatmap-legend" className="flex items-center gap-1.5">
            <span className="font-mono tabular-nums">0</span>
            <svg aria-hidden="true" width={5 * 14 - 2} height={12} className="block">
              {LEVEL_FILL.map((fill, level) => (
                <rect
                  key={level}
                  x={level * 14}
                  y={0}
                  width={12}
                  height={12}
                  rx={2.5}
                  fill={fill}
                />
              ))}
            </svg>
            <span className="font-mono tabular-nums">{formatNumber(max)}</span>
            <span>{max === 1 ? 'submission' : 'submissions'} a day</span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
