import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router';

/** Thin violet bar at the top while a route (lazy page) is loading; appears after 120 ms. */
export function NavigationProgress() {
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!visible) return null;
  return (
    <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[70] h-0.5">
      <div className="h-full origin-left animate-nav-progress bg-primary shadow-[0_0_8px_var(--color-primary)]" />
    </div>
  );
}
