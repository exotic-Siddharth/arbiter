import { cn } from '@/lib/cn';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { useNow } from '@/lib/time';

export interface TimeAgoProps {
  /** ISO timestamp. */
  date: string;
  className?: string;
}

/** "3 minutes ago" in a <time> element (full date on hover), refreshed every 30 s. */
export function TimeAgo({ date, className }: TimeAgoProps) {
  const now = useNow(30_000);
  return (
    <time
      dateTime={date}
      title={formatDateTime(date)}
      className={cn('whitespace-nowrap', className)}
    >
      {formatRelativeTime(date, now)}
    </time>
  );
}
