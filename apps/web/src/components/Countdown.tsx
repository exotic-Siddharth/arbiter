import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { describeDuration, formatCountdown, formatDuration } from '@/lib/format';

export interface CountdownProps {
  /** Target time (ISO string, Date or epoch ms), e.g. contest.startsAt or contest.endsAt. */
  to: string | number | Date;
  /**
   * Server clock minus client clock in ms; from computeServerOffset(contest.serverTime,
   * query.dataUpdatedAt) (R18 / Review Focus 3). Default 0.
   */
  serverOffsetMs?: number;
  /** Called once when the countdown crosses zero while mounted (e.g. refetch the contest). */
  onComplete?: () => void;
  /** clock = "01:02:03" / "3d 01:02:03" (default); compact = "3d 1h 2m". */
  format?: 'clock' | 'compact';
  /** Spoken suffix, e.g. "until the start" (default "remaining"). */
  label?: string;
  className?: string;
}

function toEpoch(value: string | number | Date): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return Date.parse(value);
}

/** Live countdown (role="timer") corrected for client clock skew, ticking on whole seconds. */
export function Countdown({
  to,
  serverOffsetMs = 0,
  onComplete,
  format = 'clock',
  label = 'remaining',
  className,
}: CountdownProps) {
  const target = toEpoch(to);
  const remainingAt = (now: number) => target - (now + serverOffsetMs);
  const [remaining, setRemaining] = useState(() => remainingAt(Date.now()));
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasRunning = target - (Date.now() + serverOffsetMs) > 0;
    const tick = () => {
      const left = target - (Date.now() + serverOffsetMs);
      setRemaining(left);
      if (left <= 0) {
        if (wasRunning) onCompleteRef.current?.();
        wasRunning = false;
        return;
      }
      // Wake up when the displayed second changes.
      timer = setTimeout(tick, left % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [target, serverOffsetMs]);

  const safe = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={`${describeDuration(safe)} ${label}`}
      className={cn('font-mono tabular-nums', className)}
    >
      {format === 'compact' ? formatDuration(Math.ceil(safe / 60_000) * 60_000) : formatCountdown(Math.ceil(safe / 1000) * 1000)}
    </span>
  );
}
