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
});
