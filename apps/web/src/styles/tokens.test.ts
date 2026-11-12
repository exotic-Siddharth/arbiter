import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8');

/** Hex custom properties declared in the first `selector { ... }` block of index.css. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const blend = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => c * alpha + bg[i]! * (1 - alpha)) as Rgb;
function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Tokens used as badge / chip text colours (Badge soft variant: 12% tint of the same colour). */
const BADGE_TOKENS = [
  'primary-text',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  'verdict-ac',
  'verdict-wa',
  'verdict-tle',
  'verdict-mle',
  'verdict-re',
  'verdict-ce',
  'verdict-ole',
  'difficulty-easy',
  'difficulty-medium',
  'difficulty-hard',
  'tier-green',
  'tier-cyan',
  'tier-blue',
  'tier-violet',
  'tier-amber',
];

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('%s theme contrast (WCAG AA, 4.5:1)', (_name, selector) => {
  const t = tokens(selector);

  it('white button text on the primary and hover backgrounds', () => {
    expect(contrast(rgb(t['on-primary']!), rgb(t['primary']!))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(t['on-primary']!), rgb(t['primary-hover']!))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BADGE_TOKENS)('%s text on its 12%% tint over the page and card surfaces', (token) => {
    const color = rgb(t[token]!);
    for (const surface of ['surface', 'background']) {
      const bg = rgb(t[surface]!);
      const ratio = contrast(color, blend(color, bg, 0.12));
      expect(ratio, `${token} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/** `--color-<name>: rgb(r g b / a);` in the given block, as [rgb, alpha]. */
function rgbaToken(selector: string, name: string): [Rgb, number] {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const m = new RegExp(String.raw`--color-${name}:\s*rgb\((\d+) (\d+) (\d+) / ([\d.]+)\)\s*;`).exec(
    body,
  );
  expect(m, `--color-${name} in ${selector}`).not.toBeNull();
  return [[Number(m![1]), Number(m![2]), Number(m![3])], Number(m![4])];
}

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('%s theme own-row tint (A-R2-16)', (_name, selector) => {
  const t = tokens(selector);
  const [soft, alpha] = rgbaToken(selector, 'primary-soft');

  it('the soft tint uses the current primary hue', () => {
    expect(soft).toEqual(rgb(t['primary']!));
  });

  it('the opaque sticky tint equals the soft tint composited over the surface', () => {
    const composited = blend(soft, rgb(t['surface']!), alpha);
    const solid = rgb(t['primary-soft-solid']!);
    solid.forEach((c, i) => expect(Math.abs(c - composited[i]!)).toBeLessThanOrEqual(1));
  });
});
