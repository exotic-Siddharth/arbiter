import { LANGUAGES, type Language } from '@arbiter/shared';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draftKey, useDraft } from './useDraft';

describe('useDraft', () => {
  it('persists a draft per problem+language and starts others from the template', () => {
    const { result, rerender } = renderHook(
      ({ slug, language }: { slug: string; language: Language }) => useDraft(slug, language),
      { initialProps: { slug: 'lantern-relay', language: 'PYTHON' as Language } },
    );
    expect(result.current.code).toBe(LANGUAGES.PYTHON.template);
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setCode('print(42)\n'));
    expect(result.current.code).toBe('print(42)\n');
    expect(result.current.isDirty).toBe(true);
    expect(window.localStorage.getItem(draftKey('lantern-relay', 'PYTHON'))).toBe('print(42)\n');

    // Another language of the same problem starts from its own template.
    rerender({ slug: 'lantern-relay', language: 'CPP' });
    expect(result.current.code).toBe(LANGUAGES.CPP.template);

    // Another problem in the same language has its own draft.
    rerender({ slug: 'orchard-partition', language: 'PYTHON' });
    expect(result.current.code).toBe(LANGUAGES.PYTHON.template);

    // Coming back restores the saved draft.
    rerender({ slug: 'lantern-relay', language: 'PYTHON' });
    expect(result.current.code).toBe('print(42)\n');
  });

  it('reset restores the template and forgets the draft', () => {
    window.localStorage.setItem(draftKey('signal-towers', 'JAVA'), 'class Main {}');
    const { result } = renderHook(() => useDraft('signal-towers', 'JAVA'));
    expect(result.current.code).toBe('class Main {}');

    act(() => result.current.reset());
    expect(result.current.code).toBe(LANGUAGES.JAVA.template);
    expect(window.localStorage.getItem(draftKey('signal-towers', 'JAVA'))).toBeNull();
  });
});
