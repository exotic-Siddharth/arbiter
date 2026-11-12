import { useEffect, useRef, type RefObject } from 'react';
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
  savingRef?: RefObject<boolean>;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !savingRef?.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // ConfirmDialog calls onOpenChange(false) after onConfirm with the stale 'blocked' blocker; a
  // reset() then would cancel the proceed, and browser Back (re-sent by an async history.go)
  // would be blocked again. So never reset once proceed() was called for this block.
  const proceedingRef = useRef(false);
  useEffect(() => {
    if (blocker.state === 'blocked') proceedingRef.current = false;
  }, [blocker.state]);

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
        if (!open && blocker.state === 'blocked' && !proceedingRef.current) blocker.reset();
      }}
      title="Discard unsaved changes?"
      description="You have edits that have not been saved. Leaving this page will lose them."
      confirmLabel="Discard changes"
      cancelLabel="Stay"
      tone="danger"
      onConfirm={() => {
        if (blocker.state !== 'blocked') return;
        proceedingRef.current = true;
        blocker.proceed();
      }}
    />
  );
}
