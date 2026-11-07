import { useCallback, useEffect, useState } from 'react';

/**
 * localStorage helpers that never throw (privacy mode, quota exceeded, SSR). Keys are
 * namespaced by the caller, e.g. `arbiter:draft:<slug>:<language>`.
 */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored. */
export function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readStorage(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  return writeStorage(key, JSON.stringify(value));
}

/**
 * React state persisted as JSON under `key` (read once per key, written on every change).
 * Changing `key` (e.g. switching problem or language) loads that key's value.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: readJson(key, initialValue),
  }));

  // A new key: load its stored value (render-phase update, React's "adjust state on prop change").
  let current = state;
  if (state.key !== key) {
    current = { key, value: readJson(key, initialValue) };
    setState(current);
  }

  useEffect(() => {
    writeJson(current.key, current.value);
  }, [current]);

  const setValue = useCallback((value: T) => setState({ key, value }), [key]);
  return [current.value, setValue];
}
