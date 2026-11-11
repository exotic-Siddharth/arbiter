import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts. Combos are written like "Mod+Enter", "Mod+'", "Shift+Mod+Enter",
 * "Escape" or "/": `Mod` is Cmd on macOS and Ctrl elsewhere.
 */

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** "⌘" on macOS, "Ctrl" elsewhere. */
export const modKeyLabel = isMac ? '⌘' : 'Ctrl';

interface ParsedCombo {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseCombo(combo: string): ParsedCombo {
  // Split on "+" but keep a literal "+" key ("Mod++").
  const parts = combo.split(/\+(?!$)/);
  const parsed: ParsedCombo = { mod: false, ctrl: false, alt: false, shift: false, key: '' };
  for (const raw of parts) {
    const part = raw.trim();
    const lower = part.toLowerCase();
    if (lower === 'mod') parsed.mod = true;
    else if (lower === 'ctrl' || lower === 'control') parsed.ctrl = true;
    else if (lower === 'alt' || lower === 'option') parsed.alt = true;
    else if (lower === 'shift') parsed.shift = true;
    else parsed.key = part;
  }
  return parsed;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  quote: "'",
};

function normaliseKey(key: string): string {
  const lower = key.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/** True when the keyboard event matches the combo exactly (no extra modifiers). */
export function matchesHotkey(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo);
  const wantMeta = parsed.mod && isMac;
  const wantCtrl = parsed.ctrl || (parsed.mod && !isMac);
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl || event.altKey !== parsed.alt) {
    return false;
  }
  const key = normaliseKey(parsed.key);
  // Shift changes event.key for punctuation, so only compare it for named/letter keys.
  if (event.shiftKey !== parsed.shift && key.length > 1) return false;
  if (key.length === 1 && /[a-z0-9]/.test(key) && event.shiftKey !== parsed.shift) return false;
  return normaliseKey(event.key) === key;
}

/** Display parts for <Shortcut>: "Mod+Enter" -> ["Ctrl", "Enter"] (["⌘", "Enter"] on macOS). */
export function formatHotkey(combo: string): string[] {
  const parsed = parseCombo(combo);
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.mod) parts.push(modKeyLabel);
  if (parsed.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (parsed.shift) parts.push(isMac ? '⇧' : 'Shift');
  const key = normaliseKey(parsed.key);
  const names: Record<string, string> = { enter: 'Enter', escape: 'Esc', ' ': 'Space' };
  parts.push(names[key] ?? (key.length === 1 ? key.toUpperCase() : parsed.key));
  return parts;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface UseHotkeyOptions {
  enabled?: boolean;
  /** Default true. */
  preventDefault?: boolean;
  /**
   * Fire while focus is in an input/textarea. Defaults to true for combos with a modifier
   * (Mod+Enter) and false for plain keys ("/").
   */
  allowInInputs?: boolean;
}

/**
 * Document-level shortcut. Inside Monaco use CodeEditor's `keybindings` prop instead: the
 * editor consumes its own key events.
 *
 *   useHotkey('Mod+Enter', submit, { enabled: canSubmit });
 */
export function useHotkey(
  combo: string | readonly string[],
  handler: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {},
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const combos = typeof combo === 'string' ? [combo] : combo;
  const comboKey = combos.join('|');
  const { enabled = true, preventDefault = true, allowInInputs } = options;

  useEffect(() => {
    if (!enabled) return;
    const list = comboKey.split('|');
    const onKeyDown = (event: KeyboardEvent) => {
      const match = list.find((c) => matchesHotkey(event, c));
      if (!match) return;
      // A modal Dialog makes #root inert: page shortcuts must not act behind it.
      if (document.getElementById('root')?.hasAttribute('inert')) return;
      const parsed = parseCombo(match);
      const hasModifier = parsed.mod || parsed.ctrl || parsed.alt;
      if (isTypingTarget(event.target) && !(allowInInputs ?? hasModifier)) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [comboKey, enabled, preventDefault, allowInInputs]);
}
