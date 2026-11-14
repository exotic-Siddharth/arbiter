import { describe, expect, it } from 'vitest';
import { publicOrigin } from '../publicOrigin';

/** %VITE_PUBLIC_ORIGIN% in index.html: the base of the canonical link, og:url and og:image. */
describe('publicOrigin', () => {
  it('uses the configured origin', () => {
    expect(publicOrigin('https://judge.example.com', 5173)).toBe('https://judge.example.com');
  });

  it('strips trailing slashes, like the api (no https://x//og-image.png)', () => {
    expect(publicOrigin('https://judge.example.com/', 5173)).toBe('https://judge.example.com');
    expect(publicOrigin('https://judge.example.com//', 5173)).toBe('https://judge.example.com');
  });

  it('names the local server when none is configured (dev, CI builds)', () => {
    expect(publicOrigin(undefined, 5183)).toBe('http://localhost:5183');
    expect(publicOrigin('', 5173)).toBe('http://localhost:5173');
  });
});
