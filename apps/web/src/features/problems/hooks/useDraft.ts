import { LANGUAGES, type Language } from '@arbiter/shared';
import { useCallback, useState } from 'react';
import { readStorage, removeStorage, writeStorage } from '@/lib/storage';

/** localStorage key of the editor draft for one problem and language. */
export function draftKey(problemSlug: string, language: Language): string {
  return `arbiter:draft:${problemSlug}:${language}`;
}

/** Last language picked in the workspace (applies to every problem). */
export const LANGUAGE_PREFERENCE_KEY = 'arbiter:workspace:language';

export interface Draft {
  code: string;
  setCode: (code: string) => void;
  /** Back to the language template; the stored draft is removed. */
  reset: () => void;
  /** True when the code differs from the template. */
  isDirty: boolean;
}

function load(key: string, template: string): string {
  return readStorage(key) ?? template;
}

/**
 * The editor contents for one problem+language, autosaved to localStorage on every change. A
 * draft equal to the template is not stored, so template updates still reach untouched editors.
 */
export function useDraft(problemSlug: string, language: Language): Draft {
  const key = draftKey(problemSlug, language);
  const template = LANGUAGES[language].template;
  const [state, setState] = useState(() => ({ key, code: load(key, template) }));

  // Switching problem or language loads that draft (React's "adjust state on prop change").
  let current = state;
  if (state.key !== key) {
    current = { key, code: load(key, template) };
    setState(current);
  }

  const setCode = useCallback(
    (code: string) => {
      setState({ key, code });
      if (code === template) removeStorage(key);
      else writeStorage(key, code);
    },
    [key, template],
  );

  const reset = useCallback(() => {
    removeStorage(key);
    setState({ key, code: template });
  }, [key, template]);

  return { code: current.code, setCode, reset, isDirty: current.code !== template };
}
