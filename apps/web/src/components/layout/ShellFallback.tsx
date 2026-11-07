import { Spinner } from '@/components/ui/Spinner';
import { Logo } from './Logo';

/** Shown while the first route chunk loads (React Router HydrateFallback). */
export function ShellFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-muted">
      <Logo className="size-10" />
      <Spinner size="md" label="Loading Arbiter" />
    </div>
  );
}
