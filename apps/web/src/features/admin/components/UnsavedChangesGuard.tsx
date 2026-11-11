import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '@/components/ui';

/**
 * While `dirty`, asks before in-app navigation to another page (link, Back) and shows the
 * browser's own prompt on reload or tab close, so a half-written statement is not lost silently.
 * Search-param changes on the same page (editor tabs) are not blocked.
 */
export function UnsavedChangesGuard({
  dirty,
  savingRef,
}: {
  dirty: boolean;
  /** True while a save is in flight: the save may itself navigate (create, then redirect). */
  savingRef: RefObject<boolean>;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !savingRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title="Discard unsaved changes?"
      description="You have edits that have not been saved. Leaving this page will lose them."
      confirmLabel="Discard changes"
      cancelLabel="Stay"
      tone="danger"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}
