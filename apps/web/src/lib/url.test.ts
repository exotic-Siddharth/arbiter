import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './url';

describe('safeRedirectPath', () => {
  it('keeps same-site relative paths', () => {
    expect(safeRedirectPath('/problems?page=2')).toBe('/problems?page=2');
  });

  it('falls back for empty, absolute and protocol-relative values', () => {
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath('https://evil.test')).toBe('/');
    expect(safeRedirectPath('//evil.test')).toBe('/');
    expect(safeRedirectPath('/\\evil.test')).toBe('/');
  });

  it('rejects tab/newline/control characters that browsers strip into "//host"', () => {
    expect(safeRedirectPath('/\t/evil.test/x')).toBe('/');
    expect(safeRedirectPath('/\n/evil.test/x')).toBe('/');
    expect(safeRedirectPath('/\r/evil.test/x')).toBe('/');
    expect(safeRedirectPath('/a\u0000b')).toBe('/');
  });

  it('rejects backslashes anywhere', () => {
    expect(safeRedirectPath('/a\\b')).toBe('/');
  });
});
