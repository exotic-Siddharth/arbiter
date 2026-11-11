import {
  PENDING_STYLE,
  SUBMISSION_STATUS_LABELS,
  VERDICTS,
  type SubmissionStatus,
  type Verdict,
} from '@arbiter/shared';
import { Badge } from '@/components/ui/Badge';

export interface VerdictBadgeProps {
  verdict: Verdict | null | undefined;
  /** Submission status; QUEUED/COMPILING/RUNNING render as pending whatever the verdict. */
  status?: SubmissionStatus;
  /** full = "Wrong Answer" (default), short = "WA" (full label kept for screen readers). */
  variant?: 'full' | 'short';
  size?: 'sm' | 'md';
  /** With status RUNNING: shows "Running 3/12". */
  testsDone?: number;
  testsTotal?: number;
  className?: string;
}

const PENDING_STATUSES: ReadonlySet<SubmissionStatus> = new Set(['QUEUED', 'COMPILING', 'RUNNING']);

/** Verdict chip coloured by the spec 13.1 verdict tokens (--color-verdict-*). */
export function VerdictBadge({
  verdict,
  status,
  variant = 'full',
  size = 'md',
  testsDone,
  testsTotal,
  className,
}: VerdictBadgeProps) {
  const pending = (status !== undefined && PENDING_STATUSES.has(status)) || (!verdict && !status);

  if (pending) {
    let label = status ? SUBMISSION_STATUS_LABELS[status] : PENDING_STYLE.label;
    if (status === 'RUNNING' && testsTotal !== undefined && testsTotal > 0) {
      label = `${label} ${testsDone ?? 0}/${testsTotal}`;
    }
    return (
      <Badge
        data-verdict="pending"
        color={`var(--color-${PENDING_STYLE.token})`}
        size={size}
        dot="pulse"
        mono
        className={className}
      >
        {label}
      </Badge>
    );
  }

  if (!verdict) {
    // DONE/FAILED without a verdict: the judge could not finish (spec 7: FAILED = IE).
    const info = VERDICTS.IE;
    return (
      <Badge
        data-verdict="IE"
        color={`var(--color-${info.token})`}
        size={size}
        mono
        className={className}
      >
        {status === 'FAILED' ? SUBMISSION_STATUS_LABELS.FAILED : info.label}
      </Badge>
    );
  }

  const info = VERDICTS[verdict];
  return (
    <Badge
      data-verdict={verdict}
      color={`var(--color-${info.token})`}
      size={size}
      mono
      title={variant === 'short' ? info.label : undefined}
      className={className}
    >
      {variant === 'short' ? (
        <>
          <span aria-hidden="true">{info.code}</span>
          <span className="sr-only">{info.label}</span>
        </>
      ) : (
        info.label
      )}
    </Badge>
  );
}
