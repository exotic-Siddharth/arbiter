import type { JobStatus } from '@arbiter/shared';

export const REPORT_STATUS: Record<
  JobStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }
> = {
  PENDING: { label: 'Queued', tone: 'neutral' },
  RUNNING: { label: 'Running', tone: 'info' },
  DONE: { label: 'Done', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};
