import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders GFM tables and task lists', () => {
    render(
      <Markdown
        source={'| n | answer |\n|---|---|\n| 1 | 2 |\n\n- [x] parse input\n- [ ] print output'}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('renders inline and display math with KaTeX', () => {
    // remark-math: display math needs $$ fences on their own lines ($$x$$ in a line is inline).
    const { container } = render(
      <Markdown source={'Constraints: $1 \\le n \\le 10^5$.\n\n$$\n\\sum_{i=1}^{n} a_i\n$$'} />,
    );
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.katex-display')).not.toBeNull();
  });

  it('never renders raw HTML from the source', () => {
    const { container } = render(
      <Markdown
        source={'Hello <script>alert(1)</script> <img src=x onerror="alert(2)"> <b>bold</b>'}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
  });

  it('drops javascript: links and opens external links in a new tab', () => {
    render(
      <Markdown
        source={'[bad](javascript:alert(1)) [docs](https://example.com/docs) [home](/problems)'}
      />,
    );
    expect(screen.getByText('bad').closest('a')?.getAttribute('href') ?? '').not.toContain(
      'javascript',
    );
    const external = screen.getByRole('link', { name: 'docs' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'home' })).not.toHaveAttribute('target');
  });

  it('treats protocol-relative and look-alike origin links as external', () => {
    const origin = window.location.origin;
    render(
      <Markdown
        source={`[pr](//evil.com/x) [look](${origin}.evil.com/x) [userinfo](${origin}@evil.com/x) [same](${origin}/problems) [rel](/problems)`}
      />,
    );
    for (const name of ['pr', 'look', 'userinfo']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('link', { name: 'same' })).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'rel' })).not.toHaveAttribute('target');
  });

  it('renders no <img> for an unsafe image source', () => {
    const { container } = render(<Markdown source="![i](javascript:alert(1))" />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('Markdown with the real seed statements', () => {
  // vitest runs with apps/web as the working directory.
  const root = resolve(process.cwd(), '..', '..', 'seed', 'problems');
  const statement = (slug: string) => readFileSync(resolve(root, slug, 'problem.md'), 'utf8');

  it('renders the GFM table of nested-scrolls', () => {
    render(<Markdown source={statement('nested-scrolls')} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Case',
      'Opened',
      'Closed',
    ]);
  });

  it('renders the display math of average-pace with KaTeX', () => {
    const { container } = render(<Markdown source={statement('average-pace')} />);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(5);
    expect(container.textContent).not.toContain('$');
  });

  it('every seed statement renders without leftover math delimiters or KaTeX errors', () => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const { container, unmount } = render(<Markdown source={statement(entry.name)} />);
      expect(container.querySelector('.katex-error'), entry.name).toBeNull();
      expect(container.textContent, entry.name).not.toContain('$');
      unmount();
    }
  });
});
