import type { SubmissionStatus } from '@arbiter/shared';
import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface StatusStepperProps {
  status: SubmissionStatus;
  testsDone: number;
  testsTotal: number;
  className?: string;
}

const STEPS = ['QUEUED', 'COMPILING', 'RUNNING', 'DONE'] as const;

function stepLabel(step: (typeof STEPS)[number], testsDone: number, testsTotal: number): string {
  switch (step) {
    case 'QUEUED':
      return 'Queued';
    case 'COMPILING':
      return 'Compiling';
    case 'RUNNING':
      return testsTotal > 0 ? `Running ${testsDone}/${testsTotal}` : 'Running';
    case 'DONE':
      return 'Done';
  }
}

/** Queued → Compiling → Running n/m → Done, with the current step marked. */
export function StatusStepper({ status, testsDone, testsTotal, className }: StatusStepperProps) {
  const currentIndex = status === 'FAILED' ? STEPS.length - 1 : STEPS.indexOf(status);
  return (
    <ol
      aria-label="Judging progress"
      className={cn('flex items-center gap-2 text-[13px]', className)}
    >
      {STEPS.map((step, index) => {
        const state =
          index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className={cn(
                  'h-px min-w-3 flex-1 max-w-10',
                  index <= currentIndex ? 'bg-primary/60' : 'bg-border',
                )}
              />
            ) : null}
            <li
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap',
                state === 'upcoming' && 'text-muted',
                state === 'complete' && 'text-foreground',
                state === 'current' && 'font-medium text-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border text-[10px]',
                  state === 'complete' && 'border-primary/50 bg-primary-soft text-primary-text',
                  state === 'current' && 'border-primary text-primary-text',
                  state === 'upcoming' && 'border-border',
                )}
              >
                {state === 'complete' ? (
                  <Check className="size-3" />
                ) : state === 'current' ? (
                  <Spinner size="xs" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="font-mono tabular-nums">
                {stepLabel(step, testsDone, testsTotal)}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
