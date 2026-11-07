import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui/Button';
import { useTheme } from '@/stores/theme';

/** Switches between the dark ("midnight") and light themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme((state) => state.theme);
  const toggleTheme = useTheme((state) => state.toggleTheme);
  const nextLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <IconButton
      label={nextLabel}
      icon={theme === 'dark' ? <Sun /> : <Moon />}
      variant="ghost"
      size="sm"
      tooltipSide="bottom"
      onClick={toggleTheme}
      className={className}
    />
  );
}
