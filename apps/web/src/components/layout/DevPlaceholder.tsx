import { Hammer } from 'lucide-react';

export interface DevPlaceholderProps {
  /** Lane that builds the page, e.g. "A6". */
  lane: string;
  description?: string;
}

/**
 * Development-only marker for a page that a feature lane has not built yet. Renders nothing in
 * production builds. Delete this file once no page imports it.
 */
export function DevPlaceholder({ lane, description }: DevPlaceholderProps) {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
      <Hammer aria-hidden="true" className="size-5 text-muted" />
      <p className="text-sm font-medium text-foreground">Coming soon</p>
      <p className="max-w-md text-sm text-muted">
        {description ?? 'This page is part of the build plan.'} Lane {lane} builds it.
      </p>
    </div>
  );
}
