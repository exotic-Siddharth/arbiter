import { describe, expect, it } from 'vitest';
import { check } from './checker';

describe('check', () => {
  describe('TOKENS', () => {
    it('accepts equal tokens with different whitespace', () => {
      expect(check('TOKENS', '1 2\n3\n', '1\t2  3')).toBe(true);
      expect(check('TOKENS', 'a b', ' a\n\nb \n')).toBe(true);
    });

    it('rejects different or missing tokens', () => {
      expect(check('TOKENS', '1 2 3', '1 2')).toBe(false);
      expect(check('TOKENS', '1 2', '1 2 3')).toBe(false);
      expect(check('TOKENS', 'abc', 'abd')).toBe(false);
      expect(check('TOKENS', '1.0', '1')).toBe(false);
    });

    it('treats CRLF output as equal', () => {
      expect(check('TOKENS', '3\n4\n', '3\r\n4\r\n')).toBe(true);
      expect(check('EXACT', '3\n4\n', '3\r\n4\r\n')).toBe(true);
      expect(check('FLOAT', '0.5\n', '0.5\r\n')).toBe(true);
    });

    it('empty vs empty is AC, empty vs "0" is WA', () => {
      expect(check('TOKENS', '', '')).toBe(true);
      expect(check('TOKENS', '\n', '')).toBe(true);
      expect(check('TOKENS', '', '0')).toBe(false);
      expect(check('TOKENS', '0', '')).toBe(false);
      expect(check('EXACT', '', '')).toBe(true);
      expect(check('EXACT', '', '0\n')).toBe(false);
      expect(check('FLOAT', '', '')).toBe(true);
      expect(check('FLOAT', '', '0')).toBe(false);
    });

    it('ignores an extra trailing newline', () => {
      expect(check('TOKENS', '42\n', '42\n\n\n')).toBe(true);
      expect(check('TOKENS', '42', '42\n')).toBe(true);
    });
  });

  describe('EXACT', () => {
    it('strips trailing whitespace per line and trailing blank lines', () => {
      expect(check('EXACT', 'a b\nc\n', 'a b   \nc\t\n\n\n')).toBe(true);
      expect(check('EXACT', 'a b\nc', 'a b\nc\n')).toBe(true);
    });

    it('keeps leading whitespace, inner spacing and blank lines in the middle', () => {
      expect(check('EXACT', 'a b', 'a  b')).toBe(false);
      expect(check('EXACT', 'a', ' a')).toBe(false);
      expect(check('EXACT', 'a\nb', 'a\n\nb')).toBe(false);
      expect(check('EXACT', 'a\nb', 'a b')).toBe(false);
    });
  });

  describe('FLOAT', () => {
    it('accepts numbers within the absolute tolerance', () => {
      expect(check('FLOAT', '0.000001', '0.0000015', 1e-6)).toBe(true);
      expect(check('FLOAT', '1.5', '1.5000009', 1e-6)).toBe(true);
      expect(check('FLOAT', '1.5', '1.500002', 1e-6)).toBe(false);
    });

    it('accepts numbers within the relative tolerance', () => {
      expect(check('FLOAT', '1000000', '1000000.5', 1e-6)).toBe(true);
      expect(check('FLOAT', '1000000', '1000002', 1e-6)).toBe(false);
      expect(check('FLOAT', '-2e9', '-2.000001e9', 1e-6)).toBe(true);
    });

    it('uses 1e-6 when the tolerance is missing', () => {
      expect(check('FLOAT', '3.1415926', '3.1415930', null)).toBe(true);
      expect(check('FLOAT', '3.1415926', '3.1416', undefined)).toBe(false);
    });

    it('requires non-numeric tokens to be equal', () => {
      expect(check('FLOAT', 'YES 0.5', 'YES 0.5000001')).toBe(true);
      expect(check('FLOAT', 'YES 0.5', 'yes 0.5')).toBe(false);
      expect(check('FLOAT', '0.5', 'abc')).toBe(false);
      expect(check('FLOAT', 'nan', 'nan')).toBe(true);
      expect(check('FLOAT', '1', 'inf')).toBe(false);
    });

    it('rejects a different token count', () => {
      expect(check('FLOAT', '1 2', '1')).toBe(false);
      expect(check('FLOAT', '1', '1 2')).toBe(false);
    });
  });
});
