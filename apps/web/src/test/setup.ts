// Vitest setup for the web app (jsdom). Runs before every test file.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setSocketForTesting } from '@/lib/socket';
import { resetAuthForTests } from '@/stores/auth';

afterEach(() => {
  cleanup();
  resetAuthForTests();
  setSocketForTesting(null);
  window.localStorage.clear();
});

// --- jsdom gaps -------------------------------------------------------------------------------

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

if (typeof window.ResizeObserver !== 'function') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom logs "Not implemented: window.scrollTo" (React Router's ScrollRestoration calls it).
window.scrollTo = (() => {}) as typeof window.scrollTo;
