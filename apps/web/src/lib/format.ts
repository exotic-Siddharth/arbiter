import {
  DIFFICULTIES,
  LANGUAGES,
  VERDICTS,
  type Difficulty,
  type Language,
  type Verdict,
} from '@arbiter/shared';
import { format, formatDistanceStrict } from 'date-fns';

/** Display formatters shared by every page (numbers, sizes, times, dates). */

const numberFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** 12345 -> "12,345" */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** 12345 -> "12.3K" */
export function formatCompactNumber(value: number): string {
  return compactFormat.format(value);
}

/** 0.4567 -> "45.7%" (ratio 0..1). */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
}

/** 12 -> "12 ms", 1534 -> "1.53 s"; null -> "—". */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/** 812 -> "812 KB", 3456 -> "3.4 MB"; null -> "—". */
export function formatMemoryKb(kb: number | null | undefined): string {
  if (kb === null || kb === undefined) return '—';
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(kb < 10 * 1024 ? 1 : 0)} MB`;
}

/** 1536 -> "1.5 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "Nov 7, 2026" */
export function formatDate(value: string | number | Date): string {
  return format(toDate(value), 'MMM d, yyyy');
}

/** "Nov 7, 2026, 14:05" (24-hour, local time) */
export function formatDateTime(value: string | number | Date): string {
  return format(toDate(value), 'MMM d, yyyy, HH:mm');
}

/** "14:05:09" */
export function formatTime(value: string | number | Date): string {
  return format(toDate(value), 'HH:mm:ss');
}

/** "3 minutes ago", "in 2 days"; "just now" under 10 seconds. */
export function formatRelativeTime(value: string | number | Date, now: number = Date.now()): string {
  const date = toDate(value);
  if (Math.abs(date.getTime() - now) < 10_000) return 'just now';
  return formatDistanceStrict(date, now, { addSuffix: true });
}

/** Contest length: 7_200_000 -> "2h", 5_400_000 -> "1h 30m", 1_209_600_000 -> "14d". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Countdown clock: "01:02:03", or "3d 01:02:03" past a day. Negative values clamp to zero. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Spoken form of a countdown: "3 days 1 hour 2 minutes" (seconds only under a minute). */
export function describeDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(pluralize(days, 'day'));
  if (hours) parts.push(pluralize(hours, 'hour'));
  if (minutes) parts.push(pluralize(minutes, 'minute'));
  if (parts.length === 0) parts.push(pluralize(totalSeconds % 60, 'second'));
  return parts.join(' ');
}

/** pluralize(1, 'test') -> "1 test"; pluralize(3, 'test') -> "3 tests". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function languageLabel(language: Language): string {
  return LANGUAGES[language]?.label ?? language;
}

export function verdictLabel(verdict: Verdict): string {
  return VERDICTS[verdict]?.label ?? verdict;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTIES[difficulty]?.label ?? difficulty;
}

/** Two-letter initials for avatars: "demo" -> "DE", "ada_lovelace" -> "AL". */
export function initials(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
