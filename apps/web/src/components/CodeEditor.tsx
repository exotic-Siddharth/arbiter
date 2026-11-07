import { LANGUAGES, type Language } from '@arbiter/shared';
import type * as Monaco from 'monaco-editor';
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useTheme, type Theme } from '@/stores/theme';

type MonacoApi = typeof Monaco;
type StandaloneEditor = Monaco.editor.IStandaloneCodeEditor;
export type EditorOptions = Monaco.editor.IStandaloneEditorConstructionOptions;

// Monaco (~4 MB) loads on first use; jsdom tests vi.mock('@/lib/monaco') (R18).
const MonacoEditor = lazy(() => import('@/lib/monaco').then((module) => ({ default: module.MonacoEditor })));

const BASE_OPTIONS: EditorOptions = {
  fontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 14,
  lineHeight: 22,
  fontLigatures: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: true,
  renderLineHighlight: 'line',
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  padding: { top: 12, bottom: 12 },
  fixedOverflowWidgets: true,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  stickyScroll: { enabled: false },
  bracketPairColorization: { enabled: true },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, alwaysConsumeMouseWheel: false },
};

/** A shortcut inside the editor: keys like "Mod+Enter" or "Mod+'" (Mod = Ctrl, Cmd on macOS). */
export interface EditorKeybinding {
  keys: string;
  run: () => void;
}

function toMonacoKeybinding(monaco: MonacoApi, combo: string): number | null {
  let code = 0;
  for (const raw of combo.split(/\+(?!$)/)) {
    const part = raw.trim().toLowerCase();
    if (part === 'mod') code |= monaco.KeyMod.CtrlCmd;
    else if (part === 'ctrl') code |= monaco.KeyMod.WinCtrl;
    else if (part === 'shift') code |= monaco.KeyMod.Shift;
    else if (part === 'alt') code |= monaco.KeyMod.Alt;
    else {
      const named: Record<string, number> = {
        enter: monaco.KeyCode.Enter,
        "'": monaco.KeyCode.Quote,
        quote: monaco.KeyCode.Quote,
        escape: monaco.KeyCode.Escape,
        esc: monaco.KeyCode.Escape,
        space: monaco.KeyCode.Space,
        '/': monaco.KeyCode.Slash,
      };
      let key = named[part];
      if (key === undefined && /^[a-z]$/.test(part)) {
        key = monaco.KeyCode[`Key${part.toUpperCase()}` as keyof typeof monaco.KeyCode];
      }
      if (key === undefined && /^[0-9]$/.test(part)) {
        key = monaco.KeyCode[`Digit${part}` as keyof typeof monaco.KeyCode];
      }
      if (key === undefined) return null;
      code |= key;
    }
  }
  return code;
}

export interface CodeEditorProps {
  /** Arbiter language id ('CPP', 'PYTHON', ...) or any Monaco language id ('plaintext'). */
  language: Language | string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** CSS height of the editor box (default 100% of its parent). */
  height?: number | string;
  /** Defaults to the app theme (stores/theme). */
  theme?: Theme;
  /** Accessible name of the editor (default "Code editor"). */
  ariaLabel?: string;
  /** Monaco model path; give each problem+language its own to keep separate undo stacks. */
  path?: string;
  /** Extra Monaco options (merged over Arbiter's defaults). */
  options?: EditorOptions;
  /** Editor-scoped shortcuts, e.g. [{ keys: 'Mod+Enter', run: submit }]. Handlers may change. */
  keybindings?: readonly EditorKeybinding[];
  onMount?: (editor: StandaloneEditor, monaco: MonacoApi) => void;
  className?: string;
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-2.5 bg-surface p-4" aria-hidden="true">
      {[48, 72, 64, 36, 80, 56, 40].map((width, index) => (
        <Skeleton key={index} className="h-3.5" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

class EditorErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Code editor failed to load; using the plain fallback', error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Monaco code editor, bundled locally and lazy-loaded (R18). Follows the app theme, uses
 * JetBrains Mono, and falls back to a plain textarea if Monaco cannot load.
 */
export function CodeEditor({
  language,
  value,
  onChange,
  readOnly = false,
  height = '100%',
  theme,
  ariaLabel = 'Code editor',
  path,
  options,
  keybindings,
  onMount,
  className,
}: CodeEditorProps) {
  const appTheme = useTheme((state) => state.theme);
  const resolvedTheme = theme ?? appTheme;
  const monacoLanguage = language in LANGUAGES ? LANGUAGES[language as Language].monacoId : language;
  const actionPrefix = useId();
  const keybindingsRef = useRef(keybindings);
  const onMountRef = useRef(onMount);
  useEffect(() => {
    keybindingsRef.current = keybindings;
    onMountRef.current = onMount;
  });

  const handleMount = (editor: StandaloneEditor, monaco: MonacoApi) => {
    (keybindingsRef.current ?? []).forEach((binding, index) => {
      const code = toMonacoKeybinding(monaco, binding.keys);
      if (code === null) return;
      // addAction is scoped to this editor instance (addCommand is global in Monaco).
      editor.addAction({
        id: `${actionPrefix}-kb-${index}`,
        label: binding.keys,
        keybindings: [code],
        run: () => {
          keybindingsRef.current?.find((candidate) => candidate.keys === binding.keys)?.run();
        },
      });
    });
    onMountRef.current?.(editor, monaco);
  };

  const fallback = (
    <textarea
      aria-label={ariaLabel}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      onChange={(event) => onChange?.(event.target.value)}
      className="h-full w-full resize-none bg-surface p-4 font-mono text-[13px] leading-[22px] text-foreground outline-none"
    />
  );

  return (
    <div
      className={cn('relative overflow-hidden rounded-control border border-border bg-surface', className)}
      style={{ height }}
    >
      <EditorErrorBoundary fallback={fallback}>
        <Suspense fallback={<EditorLoading />}>
          <MonacoEditor
            value={value}
            language={monacoLanguage}
            path={path}
            theme={resolvedTheme === 'dark' ? 'arbiter-dark' : 'arbiter-light'}
            loading={<EditorLoading />}
            onChange={(next) => onChange?.(next ?? '')}
            onMount={handleMount}
            options={{
              ...BASE_OPTIONS,
              readOnly,
              domReadOnly: readOnly,
              renderLineHighlight: readOnly ? 'none' : 'line',
              ariaLabel,
              ...options,
            }}
          />
        </Suspense>
      </EditorErrorBoundary>
    </div>
  );
}
