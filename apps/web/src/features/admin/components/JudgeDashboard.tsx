import type { JudgeStatus, QueueCounts } from '@arbiter/shared';
import { Activity, Gauge, Hourglass, Server } from 'lucide-react';
import { TimeAgo } from '@/components';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Skeleton,
  Stat,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMs, formatNumber, formatRelativeTime, pluralize } from '@/lib/format';
import { useNow } from '@/lib/time';
import { ThroughputChart } from './ThroughputChart';

export const REFRESH_MS = 5000;
/** A worker is shown as stale when it has not reported for this long. */
const STALE_WORKER_MS = 30_000;

const QUEUE_LABELS = [
  { key: 'judge', label: 'Judge', hint: 'Submissions' },
  { key: 'run', label: 'Run', hint: 'Custom-input runs' },
  { key: 'plagiarism', label: 'Plagiarism', hint: 'Report jobs' },
] as const;

const COUNT_COLUMNS: { key: keyof QueueCounts; label: string; alert?: boolean }[] = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'active', label: 'Active' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed', alert: true },
];

function QueuesCard({ queues }: { queues: JudgeStatus['queues'] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Queues" description="BullMQ job counts." divider />
      <Table aria-label="Queue counts">
        <THead>
          <Tr>
            <Th>Queue</Th>
            {COUNT_COLUMNS.map((column) => (
              <Th key={column.key} numeric>
                {column.label}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {QUEUE_LABELS.map((queue) => (
            <Tr key={queue.key}>
              <Td>
                <span className="font-medium">{queue.label}</span>
                <span className="block text-xs text-muted">{queue.hint}</span>
              </Td>
              {COUNT_COLUMNS.map((column) => {
                const value = queues[queue.key][column.key];
                const hot = column.key === 'waiting' && value > 0;
                return (
                  <Td
                    key={column.key}
                    numeric
                    className={cn(
                      column.alert && value > 0 && 'font-medium text-danger',
                      hot && 'font-medium text-warning',
                      value === 0 && 'text-muted',
                    )}
                  >
                    {formatNumber(value)}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function WorkersCard({ workers, now }: { workers: JudgeStatus['workers']; now: number }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Workers"
        description={
          workers.length
            ? pluralize(workers.length, 'worker') + ' reporting'
            : 'No worker is reporting'
        }
        divider
      />
      {workers.length === 0 ? (
        <EmptyState
          compact
          icon={<Server />}
          title="No judge workers"
          description="Submissions will queue until a worker starts (npm run dev:worker)."
        />
      ) : (
        <Table aria-label="Workers">
          <THead>
            <Tr>
              <Th>Worker</Th>
              <Th>Last seen</Th>
              <Th numeric>Concurrency</Th>
              <Th numeric>Processed</Th>
              <Th>Started</Th>
            </Tr>
          </THead>
          <TBody>
            {workers.map((worker) => {
              const stale = now - Date.parse(worker.lastSeen) > STALE_WORKER_MS;
              return (
                <Tr key={worker.id}>
                  <Td className="max-w-[14rem]">
                    <span className="block truncate font-mono text-xs" title={worker.id}>
                      {worker.id}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      tone={stale ? 'warning' : 'success'}
                      size="sm"
                      dot={stale ? true : 'pulse'}
                    >
                      {formatRelativeTime(worker.lastSeen, now)}
                    </Badge>
                  </Td>
                  <Td numeric>{worker.concurrency}</Td>
                  <Td numeric>{formatNumber(worker.processed)}</Td>
                  <Td muted className="whitespace-nowrap">
                    <TimeAgo date={worker.startedAt} />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

export function JudgeDashboard({ data, updatedAt }: { data: JudgeStatus; updatedAt: number }) {
  const now = useNow(1000);
  const waiting = data.queues.judge.waiting + data.queues.run.waiting;
  const active = data.queues.judge.active + data.queues.run.active;
  const failed = data.queues.judge.failed + data.queues.run.failed;
  const { p50Ms, p95Ms, sample } = data.latency;
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2 font-medium text-success">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-current" />
          </span>
          Auto-refresh every {REFRESH_MS / 1000} s
        </span>
        <span aria-live="off">Updated {seconds < 2 ? 'just now' : `${seconds} s ago`}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Waiting"
          value={formatNumber(waiting)}
          hint="judge + run queues"
          icon={<Hourglass />}
        />
        <Stat
          label="Active"
          value={formatNumber(active)}
          hint="being judged now"
          icon={<Activity />}
        />
        <Stat
          label="Latency p50"
          value={p50Ms === null ? '-' : formatMs(p50Ms)}
          hint={sample > 0 ? `${pluralize(sample, 'recent submission')}` : 'no recent submissions'}
          icon={<Gauge />}
        />
        <Stat
          label="Latency p95"
          value={p95Ms === null ? '-' : formatMs(p95Ms)}
          hint={failed > 0 ? `${formatNumber(failed)} failed jobs` : 'queue to verdict'}
          icon={<Gauge />}
        />
      </div>

      <Card>
        <CardHeader
          title="Throughput"
          description="Submissions judged per minute, last 30 minutes."
          divider
        />
        <CardContent>
          <ThroughputChart points={data.throughputPerMin} />
        </CardContent>
      </Card>

      <QueuesCard queues={data.queues} />
      <WorkersCard workers={data.workers} now={now} />
    </div>
  );
}

export function MonitorSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}
