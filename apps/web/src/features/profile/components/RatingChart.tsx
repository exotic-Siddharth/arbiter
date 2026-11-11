import { RATING_TIERS, getRatingTier } from '@arbiter/shared';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { tierColorOf } from '@/components/tier';
import { formatDate, pluralize } from '@/lib/format';
import { ratingDomain, toPoints, type Point, type RatingHistoryEntry } from './ratingPoints';

const signed = (value: number) => (value > 0 ? '+' + value : String(value));

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: Point }[];
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const tier = getRatingTier(point.rating);
  return (
    <div className="max-w-64 rounded-control border border-border-strong bg-raised px-3 py-2 shadow-lg">
      <p className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground tabular-nums">
        <span
          aria-hidden="true"
          className="h-0.5 w-3 rounded-full"
          style={{ background: 'var(--color-primary)' }}
        />
        {point.rating}
        {point.delta !== null ? (
          <span
            className="text-xs font-medium"
            style={{ color: point.delta >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {signed(point.delta)}
          </span>
        ) : null}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-foreground">{point.title}</p>
      <p className="text-xs text-muted">
        {tier.name}
        {point.date ? ' · ' + formatDate(point.date) : ''}
        {point.rank ? ' · rank ' + point.rank : ''}
      </p>
    </div>
  );
}

export interface RatingChartProps {
  history: readonly RatingHistoryEntry[];
}

/**
 * Rating after each rated contest: one 2 px line with 8 px dots on a surface ring, hairline
 * grid, faint tier bands labelled with the tier names (so the tiers are never colour-only),
 * a tooltip on hover and keyboard focus (arrow keys move through the contests), and a table
 * view with every value.
 */
export function RatingChart({ history }: RatingChartProps) {
  const [asTable, setAsTable] = useState(false);
  const points = toPoints(history);
  if (points.length === 0) return null;

  const [low, high] = ratingDomain(points);
  const current = points[points.length - 1] as Point;
  const peak = Math.max(...points.map((point) => point.rating));
  const summary =
    'Rating ' +
    current.rating +
    ' (' +
    getRatingTier(current.rating).name +
    '), peak ' +
    peak +
    ' over ' +
    pluralize(history.length, 'rated contest') +
    '.';

  return (
    <figure className="space-y-2" aria-label="Rating history">
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
        <div className="max-h-72 overflow-auto rounded-control border border-border scrollbar-thin">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Rating after each rated contest</caption>
            <thead className="sticky top-0 bg-surface text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Contest
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Change
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.step} className="border-t border-border">
                  <td className="max-w-56 truncate px-3 py-1.5">{point.title}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                    {point.date ? formatDate(point.date) : 'n/a'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{point.rank ?? 'n/a'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {point.delta === null ? 'n/a' : signed(point.delta)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{point.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72 w-full" data-testid="rating-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={points}
              margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              accessibilityLayer
            >
              {RATING_TIERS.map((tier) => {
                const y1 = Math.max(tier.min ?? -Infinity, low);
                const y2 = Math.min(tier.max ?? Infinity, high);
                if (y1 >= y2) return null;
                return (
                  <ReferenceArea
                    key={tier.name}
                    y1={y1}
                    y2={y2}
                    ifOverflow="hidden"
                    fill={tierColorOf(tier)}
                    fillOpacity={0.09}
                    stroke="none"
                    label={{
                      value: tier.name,
                      position: 'insideTopRight',
                      fill: 'var(--color-muted)',
                      fontSize: 11,
                    }}
                  />
                );
              })}
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeWidth={1} />
              <XAxis
                dataKey="step"
                type="number"
                domain={[0, points.length - 1]}
                allowDecimals={false}
                tickFormatter={(value: number) => (value === 0 ? 'Start' : '#' + value)}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                padding={{ left: 8, right: 8 }}
              />
              <YAxis
                domain={[low, high]}
                width={44}
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickCount={5}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: 'var(--color-border-strong)', strokeWidth: 1 }}
                content={(props) => (
                  <ChartTooltip
                    active={props.active}
                    payload={props.payload as readonly { payload?: Point }[] | undefined}
                  />
                )}
              />
              <Line
                dataKey="rating"
                type="linear"
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={false}
                dot={{
                  r: 4,
                  fill: 'var(--color-primary)',
                  stroke: 'var(--color-surface)',
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: 'var(--color-primary)',
                  stroke: 'var(--color-surface)',
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
