import { LIMITS, utf8ByteLength, type ProblemSample } from '@arbiter/shared';
import { FlaskConical, SquareTerminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

export type ConsoleTab = 'testcase' | 'result';

export interface ConsolePanelProps {
  tab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  input: string;
  onInputChange: (input: string) => void;
  samples: readonly ProblemSample[];
  /** Badge on the Result tab while something is being judged. */
  resultBusy?: boolean;
  result: ReactNode;
  className?: string;
}

/** Bottom panel of the workspace: Testcase (custom input) and Result tabs. */
export function ConsolePanel({
  tab,
  onTabChange,
  input,
  onInputChange,
  samples,
  resultBusy = false,
  result,
  className,
}: ConsolePanelProps) {
  const bytes = utf8ByteLength(input);
  const tooLarge = bytes > LIMITS.runInputBytes;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as ConsoleTab)}
      className={cn('flex min-h-0 flex-col', className)}
    >
      <TabsList aria-label="Console" className="shrink-0 px-2">
        <TabsTrigger value="testcase" icon={<FlaskConical />}>
          Testcase
        </TabsTrigger>
        <TabsTrigger value="result" icon={<SquareTerminal />}>
          Result
          {resultBusy ? (
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="testcase"
        className="min-h-0 flex-1 overflow-auto p-3 scrollbar-thin focus-visible:outline-none"
      >
        <div className="flex h-full min-h-40 flex-col gap-2">
          {samples.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Load:</span>
              {samples.map((sample) => (
                <button
                  key={sample.ordinal}
                  type="button"
                  onClick={() => onInputChange(sample.input)}
                  aria-pressed={input === sample.input}
                  className={cn(
                    'h-6 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    input === sample.input
                      ? 'border-primary/50 bg-primary-soft text-primary-text'
                      : 'border-border text-muted hover:border-border-strong hover:text-foreground',
                  )}
                >
                  Sample {sample.ordinal}
                </button>
              ))}
            </div>
          ) : null}
          <Textarea
            label="Custom input"
            mono
            spellCheck={false}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            error={
              tooLarge ? `Input must be at most ${formatBytes(LIMITS.runInputBytes)}.` : undefined
            }
            hint={
              tooLarge ? undefined : `${formatBytes(bytes)} of ${formatBytes(LIMITS.runInputBytes)}`
            }
            containerClassName="flex min-h-0 flex-1 flex-col [&_textarea]:min-h-28 [&_textarea]:flex-1"
            className="resize-none"
          />
        </div>
      </TabsContent>
      <TabsContent
        value="result"
        className="min-h-0 flex-1 overflow-auto p-3 scrollbar-thin focus-visible:outline-none"
      >
        {result}
      </TabsContent>
    </Tabs>
  );
}
