/**
 * Monaco, bundled locally (spec 4 + R18): no CDN. This module is heavy (~4 MB) and must only be
 * imported lazily: components/CodeEditor.tsx loads it with import(). Tests vi.mock it (jsdom
 * cannot run Monaco).
 */
import { Editor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    // JavaScript gets the TypeScript service (syntax errors, completions); everything else
    // (C++, Python, Java tokenizers) only needs the base editor worker.
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// Hand the bundled instance to @monaco-editor/react, so its loader never injects a CDN script.
loader.config({ monaco });

export const MONACO_THEMES = { dark: 'arbiter-dark', light: 'arbiter-light' } as const;

monaco.editor.defineTheme(MONACO_THEMES.dark, {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7385', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'b4a6ff' },
    { token: 'string', foreground: '86efac' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'type', foreground: '67e8f9' },
    { token: 'delimiter', foreground: 'aab2c0' },
  ],
  colors: {
    'editor.background': '#12151c',
    'editor.foreground': '#e6e8ee',
    'editorLineNumber.foreground': '#4b5263',
    'editorLineNumber.activeForeground': '#9aa3b2',
    'editor.lineHighlightBackground': '#181c25',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#a594ff',
    'editor.selectionBackground': '#7c5cff4d',
    'editor.inactiveSelectionBackground': '#7c5cff26',
    'editor.selectionHighlightBackground': '#7c5cff1f',
    'editorIndentGuide.background1': '#262b36',
    'editorIndentGuide.activeBackground1': '#353b49',
    'editorBracketMatch.background': '#7c5cff26',
    'editorBracketMatch.border': '#7c5cff80',
    'editorWidget.background': '#181c25',
    'editorWidget.border': '#262b36',
    'editorSuggestWidget.background': '#181c25',
    'editorSuggestWidget.border': '#262b36',
    'editorSuggestWidget.selectedBackground': '#262b36',
    'editorHoverWidget.background': '#181c25',
    'editorHoverWidget.border': '#262b36',
    'scrollbarSlider.background': '#353b4966',
    'scrollbarSlider.hoverBackground': '#353b49aa',
    'scrollbarSlider.activeBackground': '#4b5263',
    focusBorder: '#7c5cff',
  },
});

monaco.editor.defineTheme(MONACO_THEMES.light, {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7385', fontStyle: 'italic' },
    { token: 'keyword', foreground: '5b3fd9' },
    { token: 'string', foreground: '15803d' },
    { token: 'number', foreground: 'b45309' },
    { token: 'type', foreground: '0e7490' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#11141b',
    'editorLineNumber.foreground': '#a3abba',
    'editorLineNumber.activeForeground': '#5b6475',
    'editor.lineHighlightBackground': '#f5f6fa',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#6a4af0',
    'editor.selectionBackground': '#7c5cff33',
    'editor.inactiveSelectionBackground': '#7c5cff1f',
    'editorIndentGuide.background1': '#e3e6ee',
    'editorIndentGuide.activeBackground1': '#cdd2dd',
    'editorBracketMatch.background': '#7c5cff1f',
    'editorBracketMatch.border': '#7c5cff66',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#e3e6ee',
    'scrollbarSlider.background': '#cdd2dd80',
    'scrollbarSlider.hoverBackground': '#cdd2ddcc',
    focusBorder: '#7c5cff',
  },
});

// Monaco measures glyphs when an editor is created; re-measure once the bundled mono font is in.
if (typeof document !== 'undefined' && 'fonts' in document) {
  void document.fonts
    .load('400 14px "JetBrains Mono Variable"')
    .then(() => monaco.editor.remeasureFonts())
    .catch(() => {});
}

export { monaco };
export { Editor as MonacoEditor };
