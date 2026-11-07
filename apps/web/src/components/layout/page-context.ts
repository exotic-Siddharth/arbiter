import { createContext } from 'react';

/**
 * 'shell': a Page renders its own centred container (default).
 * 'nested': inside a layout that already provides one (AdminLayout), so the Page only stacks.
 */
export const PageNestingContext = createContext<'shell' | 'nested'>('shell');
