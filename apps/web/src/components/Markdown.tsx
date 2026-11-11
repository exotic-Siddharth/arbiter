import 'katex/dist/katex.min.css';
import type { ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { cn } from '@/lib/cn';

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins: NonNullable<ComponentProps<typeof ReactMarkdown>['rehypePlugins']> = [
  [rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }],
];

function isExternal(href: string | undefined): boolean {
  return !!href && /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
}

const components: Components = {
  a: ({ node: _node, href, children, ...props }) =>
    isExternal(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ) : (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  table: ({ node: _node, ...props }) => (
    <div className="markdown-table scrollbar-thin">
      <table {...props} />
    </div>
  ),
  img: ({ node: _node, alt, ...props }) => <img alt={alt ?? ''} loading="lazy" {...props} />,
};

export interface MarkdownProps {
  /** Markdown with GFM (tables, task lists, strikethrough) and $…$ / $$…$$ KaTeX math. */
  source: string;
  className?: string;
}

/**
 * Renders problem statements, contest descriptions and previews. Raw HTML is never rendered
 * (react-markdown default: shown as text) and unsafe URLs are stripped (spec 12).
 */
export function Markdown({ source, className }: MarkdownProps) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
