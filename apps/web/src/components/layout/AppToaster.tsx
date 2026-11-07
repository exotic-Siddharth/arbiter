import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from 'sonner';
import { useTheme } from '@/stores/theme';

const TOKENS = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-border': 'var(--color-border)',
  '--normal-text': 'var(--color-foreground)',
  '--border-radius': 'var(--radius-control)',
} as CSSProperties;

/**
 * Global toasts (sonner) in the app theme. Portalled to <body> so toasts stay interactive while
 * a Dialog makes #root inert. Feature code calls toast()/toastError() from '@/lib/toast'.
 */
export function AppToaster() {
  const theme = useTheme((state) => state.theme);
  return createPortal(
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      richColors
      duration={5000}
      visibleToasts={4}
      style={TOKENS}
      toastOptions={{ className: 'font-sans text-sm' }}
    />,
    document.body,
  );
}
