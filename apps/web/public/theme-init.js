/* global window, document */
// Theme bootstrap (resolution R18): runs synchronously in <head> before the first paint, so the
// page never flashes the wrong theme. It is an external file because the production CSP is
// script-src 'self' (no inline scripts). Dark ("midnight") is the default; the store in
// src/stores/theme.ts writes the same localStorage key.
(function () {
  var theme = 'dark';
  try {
    var stored = window.localStorage.getItem('arbiter:theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (_error) {
    // Storage unavailable (privacy mode): keep the dark default.
  }
  var root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d12' : '#f7f8fb');
})();
