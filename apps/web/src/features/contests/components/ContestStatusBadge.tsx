import type { ContestStatus } from '@arbiter/shared';
import { Badge, type BadgeTone } from '@/components/ui';

const STATUS: Record<ContestStatus, { label: string; tone: BadgeTone }> = {
  RUNNING: { label: 'Running', tone: 'success' },
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  ENDED: { label: 'Ended', tone: 'neutral' },
};

export function ContestStatusBadge({
  status,
  size = 'sm',
}: {
  status: ContestStatus;
  size?: 'sm' | 'md';
}) {
  const info = STATUS[status];
  return (
    <Badge tone={info.tone} size={size} dot={status === 'RUNNING' ? 'pulse' : true}>
      {info.label}
    </Badge>
  );
}
