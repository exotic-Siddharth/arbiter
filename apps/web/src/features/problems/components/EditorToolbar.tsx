import { LANGUAGES, LANGUAGE_IDS, type Language } from '@arbiter/shared';
import { LogIn, Play, RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  IconButton,
  Select,
  Shortcut,
  Tooltip,
} from '@/components/ui';
import { formatHotkey } from '@/lib/keyboard';

export const RUN_HOTKEY = "Mod+'";
export const SUBMIT_HOTKEY = 'Mod+Enter';

const LANGUAGE_OPTIONS = LANGUAGE_IDS.map((id) => ({ value: id, label: LANGUAGES[id].label }));

export interface EditorToolbarProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  /** The draft differs from the template (reset asks for confirmation). */
  isDirty: boolean;
  onReset: () => void;
  /** Signed in: Run and Submit are available; otherwise a login link is shown. */
  signedIn: boolean;
  loginTo: string;
  onRun: () => void;
  onSubmit: () => void;
  running: boolean;
  submitting: boolean;
  /** Why Submit is disabled (e.g. not registered for the running contest). */
  submitBlockedReason?: string;
}

const hotkeyText = (combo: string) => formatHotkey(combo).join('+');

/** Editor toolbar: language, reset to template, shortcut hints, Run and Submit. */
export function EditorToolbar({
  language,
  onLanguageChange,
  isDirty,
  onReset,
  signedIn,
  loginTo,
  onRun,
  onSubmit,
  running,
  submitting,
  submitBlockedReason,
}: EditorToolbarProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-2 sm:px-3">
      <Select
        aria-label="Language"
        size="sm"
        options={LANGUAGE_OPTIONS}
        value={language}
        onChange={(event) => onLanguageChange(event.target.value as Language)}
        containerClassName="w-44"
      />
      <IconButton
        label="Reset to template"
        icon={<RotateCcw />}
        variant="ghost"
        size="sm"
        onClick={() => (isDirty ? setConfirmReset(true) : onReset())}
      />

      <div className="ml-auto flex items-center gap-2">
        {signedIn ? (
          <>
            <div
              className="hidden items-center gap-3 text-xs text-muted 2xl:flex"
              aria-hidden="true"
            >
              <span className="inline-flex items-center gap-1.5">
                <Shortcut keys={RUN_HOTKEY} /> run
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Shortcut keys={SUBMIT_HOTKEY} /> submit
              </span>
            </div>
            <Tooltip content={`Run on the custom input (${hotkeyText(RUN_HOTKEY)})`}>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Play />}
                loading={running}
                onClick={onRun}
                aria-keyshortcuts={RUN_HOTKEY.replace('Mod', 'Control')}
              >
                Run
                <span className="hidden font-mono text-[11px] text-muted lg:inline 2xl:hidden">
                  {hotkeyText(RUN_HOTKEY)}
                </span>
              </Button>
            </Tooltip>
            <Tooltip
              content={submitBlockedReason ?? `Submit for judging (${hotkeyText(SUBMIT_HOTKEY)})`}
            >
              <Button
                size="sm"
                leftIcon={<Send />}
                loading={submitting}
                disabled={submitBlockedReason !== undefined}
                onClick={onSubmit}
                aria-keyshortcuts="Control+Enter"
              >
                Submit
                <span className="hidden font-mono text-[11px] opacity-75 lg:inline 2xl:hidden">
                  {hotkeyText(SUBMIT_HOTKEY)}
                </span>
              </Button>
            </Tooltip>
          </>
        ) : (
          <ButtonLink to={loginTo} size="sm" leftIcon={<LogIn />}>
            Log in to run and submit
          </ButtonLink>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to the template?"
        description={`Your ${LANGUAGES[language].label} draft for this problem will be replaced by the starter code.`}
        confirmLabel="Reset code"
        tone="danger"
        onConfirm={async () => {
          onReset();
        }}
      />
    </div>
  );
}
