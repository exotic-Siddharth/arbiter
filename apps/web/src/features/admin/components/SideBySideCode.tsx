import { LANGUAGES, type PlagiarismSide } from '@arbiter/shared';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { splitLines } from '../lib/lines';

function CodePane({ side, label }: { side: PlagiarismSide; label: string }) {
  const lines = splitLines(side.sourceCode);
  const matched = new Set(side.matchedLines);
  const width = String(lines.length).length;
  return (
    <section
      aria-label={`${label}: ${side.username}`}
      className="min-w-0 overflow-hidden rounded-control border border-border bg-background/40"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <span className="min-w-0 truncate">
          <span className="text-muted">{label} </span>
          <Link
            to={`/u/${encodeURIComponent(side.username)}`}
            className="font-medium hover:underline"
          >
            {side.username}
          </Link>
        </span>
        <span className="text-xs text-muted">
          {LANGUAGES[side.language].label} · {pluralize(matched.size, 'matched line')}
        </span>
      </header>
      <div className="relative max-h-[32rem] overflow-auto scrollbar-thin">
        <pre className="min-w-max py-2 font-mono text-[12.5px] leading-[1.55]">
          <code>
            {lines.map((text, index) => {
              const number = index + 1;
              const isMatch = matched.has(number);
              return (
                <span
                  key={number}
                  data-matched={isMatch ? 'true' : undefined}
                  className={cn(
                    'flex border-l-2 pr-4',
                    isMatch ? 'border-warning bg-warning/15' : 'border-transparent',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 select-none px-3 text-right text-muted tabular-nums"
                    style={{ minWidth: `${width + 2}ch` }}
                  >
                    {number}
                  </span>
                  <span className="whitespace-pre">
                    {text || ' '}
                    {isMatch ? <span className="sr-only"> (matched line)</span> : null}
                  </span>
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </section>
  );
}

export interface SideBySideCodeProps {
  a: PlagiarismSide;
  b: PlagiarismSide;
}

/** Two submissions next to each other (stacked on small screens), matched lines highlighted. */
export function SideBySideCode({ a, b }: SideBySideCodeProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CodePane side={a} label="A" />
      <CodePane side={b} label="B" />
    </div>
  );
}
