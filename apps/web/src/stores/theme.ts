import { create } from 'zustand';
import { readStorage, writeStorage } from '@/lib/storage';

export type Theme = 'dark' | 'light';

/** Same key as public/theme-init.js, which applies the theme before the first paint. */
export const THEME_STORAGE_KEY = 'arbiter:theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0b0d12', light: '#f7f8fb' };

function storedTheme(): Theme | null {
  const value = readStorage(THEME_STORAGE_KEY);
  return value === 'dark' || value === 'light' ? value : null;
}

/** The stored choice, else dark ("midnight" is the default, as in theme-init.js). */
function initialTheme(): Theme {
  return storedTheme() ?? 'dark';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export interface ThemeState {
  theme: Theme;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
}

/** App theme (dark default). Monaco, the toaster and charts follow it. */
export const useTheme = create<ThemeState>()((set, get) => ({
  theme: initialTheme(),
  setTheme(theme) {
    writeStorage(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));

applyTheme(useTheme.getState().theme);

// Keep tabs in sync when the theme changes in another tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const next = storedTheme();
    if (next && next !== useTheme.getState().theme) {
      applyTheme(next);
      useTheme.setState({ theme: next });
    }
  });
}
