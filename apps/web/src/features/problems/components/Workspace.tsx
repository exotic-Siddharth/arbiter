import {
  CreateSubmissionResponseSchema,
  LANGUAGES,
  LIMITS,
  utf8ByteLength,
  type ContestDetail,
  type Language,
  type ProblemDetail,
  type SubmissionDetail,
} from '@arbiter/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, History, Terminal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLocation } from 'react-router';
import { CodeEditor } from '@/components/CodeEditor';
import {
  Alert,
  ButtonLink,
  EmptyState,
  ErrorState,
  Shortcut,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useHotkey } from '@/lib/keyboard';
import { qk } from '@/lib/queryKeys';
import { useLocalStorage } from '@/lib/storage';
import { toast, toastError } from '@/lib/toast';
import { loginHref } from '@/lib/url';
import { useCurrentUser } from '@/stores/auth';
import { LANGUAGE_PREFERENCE_KEY, useDraft } from '../hooks/useDraft';
import { DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useRun } from '../hooks/useRun';
import { useSubmissionProgress } from '../hooks/useSubmissionProgress';
import { detailFromSummary } from '../lib/progress';
import { ConsolePanel, type ConsoleTab } from './ConsolePanel';
import { ContestBar } from './ContestBar';
import { EditorToolbar, RUN_HOTKEY, SUBMIT_HOTKEY } from './EditorToolbar';
import { MySubmissions } from './MySubmissions';
import { ProblemStatement } from './ProblemStatement';
import { ResultPanel } from './ResultPanel';
import { RunOutput } from './RunOutput';

export interface WorkspaceContest {
  detail: ContestDetail;
  label: string;
  serverOffsetMs: number;
  onPhaseChange: () => void;
}

export interface WorkspaceProps {
  problem: ProblemDetail;
  /** Contest mode (/contests/:slug/problems/:label). */
  contest?: WorkspaceContest;
}

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in LANGUAGES;
}

function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={cn(
        'group relative flex shrink-0 items-center justify-center outline-none',
        direction === 'horizontal' ? 'w-2' : 'h-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full bg-border transition-colors duration-150 group-hover:bg-primary/60 group-focus-visible:bg-primary group-data-[resize-handle-state=drag]:bg-primary',
          direction === 'horizontal' ? 'h-10 w-1' : 'h-1 w-10',
        )}
      />
    </PanelResizeHandle>
  );
}

function PanelCard({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The problem workspace: statement, editor, console; resizable at lg+, stacked below. */
export function Workspace({ problem, contest }: WorkspaceProps) {
  const user = useCurrentUser();
  const location = useLocation();
  const queryClient = useQueryClient();
  const desktop = useMediaQuery(DESKTOP_QUERY);

  const [storedLanguage, setStoredLanguage] = useLocalStorage<Language>(
    LANGUAGE_PREFERENCE_KEY,
    'CPP',
  );
  const language: Language = isLanguage(storedLanguage) ? storedLanguage : 'CPP';
  const draft = useDraft(problem.slug, language);
  const [input, setInput] = useState(problem.samples[0]?.input ?? '');
  const [statementTab, setStatementTab] = useState('description');
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('testcase');
  const [lastAction, setLastAction] = useState<'run' | 'submit' | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);

  const run = useRun();
  const submission = useSubmissionProgress(activeSubmissionId);

  const contestSlug = contest?.detail.slug;
  let submitBlockedReason: string | undefined;
  if (contest?.detail.status === 'UPCOMING')
    submitBlockedReason = 'The contest has not started yet.';
  else if (contest?.detail.status === 'RUNNING' && !contest.detail.isRegistered) {
    submitBlockedReason = 'Register for the contest to submit.';
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post(
        '/submissions',
        {
          problemSlug: problem.slug,
          language,
          sourceCode: draft.code,
          ...(contestSlug ? { contestSlug } : {}),
        },
        { schema: CreateSubmissionResponseSchema },
      ),
    onSuccess: ({ submission: created }) => {
      const key = qk.submissions.detail(created.id);
      if (!queryClient.getQueryData<SubmissionDetail>(key)) {
        queryClient.setQueryData(key, detailFromSummary(created));
      }
      setActiveSubmissionId(created.id);
      setLastAction('submit');
      setConsoleTab('result');
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'list'] });
    },
    onError: (error) => {
      toastError(
        error,
        isApiError(error) && error.code === 'RATE_LIMITED' ? undefined : 'Submission not sent',
      );
    },
  });

  const checkSource = (): boolean => {
    if (draft.code.trim().length === 0) {
      toast.error('Nothing to send', { description: 'Write some code first.' });
      return false;
    }
    if (utf8ByteLength(draft.code) > LIMITS.sourceCodeBytes) {
      toast.error('Code too long', {
        description: `Source code must be at most ${formatBytes(LIMITS.sourceCodeBytes)}.`,
      });
      return false;
    }
    return true;
  };

  const handleRun = () => {
    if (!user || run.isBusy || !checkSource()) return;
    if (utf8ByteLength(input) > LIMITS.runInputBytes) {
      toast.error('Input too large', {
        description: `Custom input must be at most ${formatBytes(LIMITS.runInputBytes)}.`,
      });
      return;
    }
    run.start({ language, sourceCode: draft.code, input, problemSlug: problem.slug });
    setLastAction('run');
    setConsoleTab('result');
  };

  const handleSubmit = () => {
    if (!user || submitMutation.isPending || submitBlockedReason || !checkSource()) return;
    submitMutation.mutate();
  };

  useHotkey(RUN_HOTKEY, handleRun, { enabled: user !== null });
  useHotkey(SUBMIT_HOTKEY, handleSubmit, { enabled: user !== null });

  const judging = lastAction === 'submit' ? submission.isPending : run.isBusy;

  let result: ReactNode;
  if (lastAction === 'run') {
    result = (
      <RunOutput
        phase={run.phase}
        result={run.result}
        sample={problem.samples.find((sample) => sample.input === run.input)}
      />
    );
  } else if (lastAction === 'submit' && activeSubmissionId) {
    if (submission.progress) {
      result = <ResultPanel progress={submission.progress} detail={submission.detail} />;
    } else if (submission.query.isError) {
      result = (
        <ErrorState
          compact
          error={submission.query.error}
          onRetry={() => void submission.query.refetch()}
        />
      );
    } else {
      result = (
        <div className="flex items-center gap-2.5 py-2 text-sm text-muted">
          <Spinner size="sm" /> Loading the result…
        </div>
      );
    }
  } else {
    result = (
      <EmptyState
        compact
        icon={<Terminal />}
        title="No results yet"
        description={
          user ? (
            <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
              Run on the custom input <Shortcut keys={RUN_HOTKEY} /> or submit{' '}
              <Shortcut keys={SUBMIT_HOTKEY} /> to see results here.
            </span>
          ) : (
            'Log in to run your code and submit it for judging.'
          )
        }
      />
    );
  }

  const statement = (
    <Tabs
      value={statementTab}
      onValueChange={setStatementTab}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList aria-label="Problem" className="shrink-0 px-2">
        <TabsTrigger value="description" icon={<BookOpen />}>
          Description
        </TabsTrigger>
        {user ? (
          <TabsTrigger value="submissions" icon={<History />}>
            My submissions
          </TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent
        value="description"
        className={cn(
          'px-4 py-4 focus-visible:outline-none sm:px-5',
          desktop && 'min-h-0 flex-1 overflow-y-auto scrollbar-thin',
        )}
      >
        <ProblemStatement
          problem={problem}
          label={contest?.label}
          onUseInput={(sampleInput) => {
            setInput(sampleInput);
            setConsoleTab('testcase');
          }}
        />
      </TabsContent>
      {user ? (
        <TabsContent
          value="submissions"
          className={cn(
            'p-3 focus-visible:outline-none',
            desktop && 'min-h-0 flex-1 overflow-y-auto scrollbar-thin',
          )}
        >
          <MySubmissions
            problemSlug={problem.slug}
            activeId={activeSubmissionId}
            onSelect={(selected) => {
              setActiveSubmissionId(selected.id);
              setLastAction('submit');
              setConsoleTab('result');
            }}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );

  const editor = (
    <>
      <EditorToolbar
        language={language}
        onLanguageChange={setStoredLanguage}
        isDirty={draft.isDirty}
        onReset={draft.reset}
        signedIn={user !== null}
        loginTo={loginHref(location.pathname)}
        onRun={handleRun}
        onSubmit={handleSubmit}
        running={run.isBusy}
        submitting={submitMutation.isPending}
        submitBlockedReason={submitBlockedReason}
      />
      <div className="min-h-0 flex-1">
        <CodeEditor
          language={language}
          value={draft.code}
          onChange={draft.setCode}
          path={`${problem.slug}/${LANGUAGES[language].fileName}`}
          ariaLabel={`${LANGUAGES[language].label} solution`}
          keybindings={[
            { keys: SUBMIT_HOTKEY, run: handleSubmit },
            { keys: RUN_HOTKEY, run: handleRun },
          ]}
          className="rounded-none border-0"
        />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted">
        <span>{LANGUAGES[language].fileName}</span>
        <span>{draft.isDirty ? 'Draft saved in this browser' : 'Starter template'}</span>
      </div>
    </>
  );

  const consolePanel = (
    <ConsolePanel
      tab={consoleTab}
      onTabChange={setConsoleTab}
      input={input}
      onInputChange={setInput}
      samples={problem.samples}
      resultBusy={judging}
      result={result}
      className="min-h-0 flex-1"
    />
  );

  const notice =
    contest && submitBlockedReason && user ? (
      <Alert
        tone="info"
        className="mx-2 mt-2 lg:mx-3"
        action={
          contest.detail.status === 'RUNNING' ? (
            <ButtonLink to={`/contests/${encodeURIComponent(contest.detail.slug)}`} size="sm">
              Go to the contest page
            </ButtonLink>
          ) : undefined
        }
      >
        {submitBlockedReason} You can still run your code on custom input.
      </Alert>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {contest ? (
        <ContestBar
          contest={contest.detail}
          label={contest.label}
          serverOffsetMs={contest.serverOffsetMs}
          onPhaseChange={contest.onPhaseChange}
        />
      ) : null}
      {notice}
      {desktop ? (
        <PanelGroup
          direction="horizontal"
          autoSaveId="arbiter:workspace:columns"
          className="min-h-0 flex-1 p-2 lg:p-3"
        >
          <Panel id="statement" order={1} defaultSize={44} minSize={25}>
            <PanelCard label="Problem statement" className="h-full">
              {statement}
            </PanelCard>
          </Panel>
          <ResizeHandle direction="horizontal" />
          <Panel id="code" order={2} defaultSize={56} minSize={32}>
            <PanelGroup direction="vertical" autoSaveId="arbiter:workspace:rows">
              <Panel id="editor" order={1} defaultSize={64} minSize={25}>
                <PanelCard label="Code editor" className="h-full">
                  {editor}
                </PanelCard>
              </Panel>
              <ResizeHandle direction="vertical" />
              <Panel id="console" order={2} defaultSize={36} minSize={14}>
                <PanelCard label="Console" className="h-full">
                  {consolePanel}
                </PanelCard>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <PanelCard label="Problem statement">{statement}</PanelCard>
          <PanelCard label="Code editor" className="h-[65dvh] min-h-[22rem]">
            {editor}
          </PanelCard>
          <PanelCard label="Console" className="min-h-80">
            {consolePanel}
          </PanelCard>
        </div>
      )}
    </div>
  );
}
