import { PENDING_STYLE, VERDICTS } from '@arbiter/shared';
import { Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMemoryKb, formatMs } from '@/lib/format';
import type { TestChipData } from '../lib/progress';

export interface TestChipsProps {
  tests: readonly TestChipData[];
  /** Total number of tests; missing ordinals render as pending placeholders. */
  total: number;
  /** Placeholders pulse while the submission is still running. */
  running?: boolean;
  className?: string;
}

/** Per-test chips coloured by verdict, filled in as submission:test events arrive. */
export function TestChips({ tests, total, running = false, className }: TestChipsProps) {
  const byOrdinal = new Map(tests.map((test) => [test.ordinal, test]));
  const count = Math.max(total, tests.at(-1)?.ordinal ?? 0);
  if (count === 0) return null;

  return (
    <ul aria-label="Test results" className={cn('flex flex-wrap gap-1.5', className)}>
      {Array.from({ length: count }, (_, index) => {
        const ordinal = index + 1;
        const test = byOrdinal.get(ordinal);
        if (!test) {
          return (
            <li
              key={ordinal}
              aria-label={`Test ${ordinal}: ${running ? 'pending' : 'not run'}`}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border border-dashed border-border-strong font-mono text-[11px] text-muted tabular-nums',
                running && 'animate-pulse',
              )}
              style={{ color: `var(--color-${PENDING_STYLE.token})` }}
            >
              {ordinal}
            </li>
          );
        }
        const info = VERDICTS[test.verdict];
        const color = `var(--color-${info.token})`;
        const description = `${info.label}, ${formatMs(test.timeMs)}, ${formatMemoryKb(test.memoryKb)}${test.isSample ? ', sample' : ''}`;
        return (
          <li
            key={ordinal}
            aria-label={`Test ${ordinal}: ${description}`}
            className="animate-scale-in"
          >
            <Tooltip
              content={
                <span className="font-mono text-xs">
                  #{ordinal} {info.code} · {formatMs(test.timeMs)} · {formatMemoryKb(test.memoryKb)}
                  {test.isSample ? ' · sample' : ''}
                </span>
              }
            >
              <span
                data-verdict={test.verdict}
                className="relative flex size-7 cursor-default items-center justify-center rounded-md border font-mono text-[11px] font-semibold tabular-nums"
                style={{
                  color,
                  borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
                  backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                }}
              >
                {test.verdict === 'AC' ? ordinal : info.code}
                {test.isSample ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-accent"
                  />
                ) : null}
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
