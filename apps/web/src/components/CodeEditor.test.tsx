import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useTheme } from '@/stores/theme';
import { CodeEditor } from './CodeEditor';

// jsdom cannot run Monaco (R18): replace the lazily imported module with a textarea stand-in.
vi.mock('@/lib/monaco', () => ({
  MONACO_THEMES: { dark: 'arbiter-dark', light: 'arbiter-light' },
  MonacoEditor: (props: {
    value?: string;
    language?: string;
    theme?: string;
    options?: { readOnly?: boolean; ariaLabel?: string; hover?: { enabled?: string } };
    onChange?: (value: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco"
      data-language={props.language}
      data-theme={props.theme}
      data-hover={props.options?.hover?.enabled ?? 'on'}
      aria-label={props.options?.ariaLabel}
      readOnly={props.options?.readOnly}
      value={props.value}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}));

describe('CodeEditor', () => {
  it('lazy-loads the editor with the Monaco language of an Arbiter language id', async () => {
    render(<CodeEditor language="CPP" value="int main() {}" ariaLabel="Solution" />);
    const editor = await screen.findByTestId('monaco');
    expect(editor).toHaveAttribute('data-language', 'cpp');
    expect(editor).toHaveValue('int main() {}');
    expect(editor).toHaveAccessibleName('Solution');
  });

  it('follows the app theme unless a theme is given', async () => {
    useTheme.setState({ theme: 'light' });
    const { rerender } = render(<CodeEditor language="PYTHON" value="" />);
    expect(await screen.findByTestId('monaco')).toHaveAttribute('data-theme', 'arbiter-light');
    rerender(<CodeEditor language="PYTHON" value="" theme="dark" />);
    expect(screen.getByTestId('monaco')).toHaveAttribute('data-theme', 'arbiter-dark');
    useTheme.setState({ theme: 'dark' });
  });

  // Hovers render Markdown (JSDoc from the TypeScript worker) through the DOMPurify copy bundled in
  // monaco-editor, which npm audit flags (<= 3.4.16; no Monaco release ships a fix yet). A read-only
  // editor shows someone else's code (submission pages, admin views), so it renders no hovers.
  it("renders no hover popups when read-only, and keeps them for the user's own code", async () => {
    const { rerender } = render(<CodeEditor language="JAVASCRIPT" value="" readOnly />);
    expect(await screen.findByTestId('monaco')).toHaveAttribute('data-hover', 'off');
    rerender(<CodeEditor language="JAVASCRIPT" value="" />);
    expect(screen.getByTestId('monaco')).toHaveAttribute('data-hover', 'on');
  });

  it('reports edits through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CodeEditor language="JAVASCRIPT" value="" onChange={onChange} />);
    await user.type(await screen.findByTestId('monaco'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
