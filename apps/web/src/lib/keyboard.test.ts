import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatHotkey, matchesHotkey, useHotkey } from './keyboard';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { bubbles: true, ...init });

describe('keyboard shortcuts (jsdom is not macOS, so Mod = Ctrl)', () => {
  it('matches combos exactly', () => {
    expect(matchesHotkey(key({ key: 'Enter', ctrlKey: true }), 'Mod+Enter')).toBe(true);
    expect(matchesHotkey(key({ key: 'Enter' }), 'Mod+Enter')).toBe(false);
    expect(matchesHotkey(key({ key: 'Enter', ctrlKey: true, altKey: true }), 'Mod+Enter')).toBe(
      false,
    );
    expect(matchesHotkey(key({ key: "'", ctrlKey: true }), "Mod+'")).toBe(true);
    expect(
      matchesHotkey(key({ key: 'Enter', ctrlKey: true, shiftKey: true }), 'Shift+Mod+Enter'),
    ).toBe(true);
    expect(matchesHotkey(key({ key: 'Escape' }), 'Escape')).toBe(true);
  });

  it('formats combos for display', () => {
    expect(formatHotkey('Mod+Enter')).toEqual(['Ctrl', 'Enter']);
    expect(formatHotkey("Mod+'")).toEqual(['Ctrl', "'"]);
  });

  it('useHotkey fires in text inputs only for modifier combos', () => {
    const submit = vi.fn();
    const search = vi.fn();
    renderHook(() => {
      useHotkey('Mod+Enter', submit);
      useHotkey('/', search);
    });
    const input = document.createElement('textarea');
    document.body.append(input);
    input.dispatchEvent(key({ key: 'Enter', ctrlKey: true }));
    input.dispatchEvent(key({ key: '/' }));
    document.body.dispatchEvent(key({ key: '/' }));
    input.remove();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('useHotkey stays quiet while a modal dialog has made #root inert', () => {
    const submit = vi.fn();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    renderHook(() => useHotkey('Mod+Enter', submit));
    root.setAttribute('inert', '');
    document.body.dispatchEvent(key({ key: 'Enter', ctrlKey: true }));
    expect(submit).not.toHaveBeenCalled();
    root.removeAttribute('inert');
    document.body.dispatchEvent(key({ key: 'Enter', ctrlKey: true }));
    expect(submit).toHaveBeenCalledTimes(1);
    root.remove();
  });
});
