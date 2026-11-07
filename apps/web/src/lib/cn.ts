import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge that knows the custom theme scales in styles/index.css, so that e.g.
 * cn('rounded-control', 'rounded-full') keeps only the last radius.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['card', 'control'],
      animate: [
        'fade-in',
        'scale-in',
        'slide-down',
        'slide-up',
        'enter-top',
        'highlight',
        'progress-indeterminate',
        'nav-progress',
      ],
    },
  },
});

/** Joins class names (clsx syntax) and resolves Tailwind conflicts: the last class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
