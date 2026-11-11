import type { Language } from '@arbiter/shared';

/**
 * Winnowing (as in MOSS), spec section 9. Pure functions:
 *   tokenize(lang, code)      comments and whitespace dropped; identifiers -> I, numbers -> N,
 *                             string/char literals -> S; keywords and operators kept as-is
 *   fingerprints(tokens, k, w) 64-bit FNV-1a over each k-gram of token kinds, winnowed with
 *                             window w (minimum per window, rightmost on ties)
 *   similarity(fa, fb)        |FA ∩ FB| / min(|FA|, |FB|) over distinct hashes
 */

export interface Token {
  /** Keyword or operator text, or I / N / S. */
  kind: string;
  /** 1-based line of the token's first character. */
  line: number;
}

export interface Fingerprint {
  hash: bigint;
  /** Distinct 1-based lines of the k-gram's tokens, ascending. */
  lines: number[];
}

export const DEFAULT_K = 8;
export const DEFAULT_W = 4;

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

const KEYWORDS: Record<Language, ReadonlySet<string>> = {
  CPP: words(`alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t
    char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue
    co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit
    export extern false float for friend goto if inline int long mutable namespace new noexcept not
    not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires
    return short signed sizeof static static_assert static_cast struct switch template this
    thread_local throw true try typedef typeid typename union unsigned using virtual void volatile
    wchar_t while xor xor_eq`),
  JAVA: words(`abstract assert boolean break byte case catch char class const continue default do
    double else enum extends final finally float for goto if implements import instanceof int
    interface long native new non-sealed null package permits private protected public record
    return sealed short static strictfp super switch synchronized this throw throws transient true
    false try var void volatile while yield`),
  JAVASCRIPT: words(`async await break case catch class const continue debugger default delete do
    else export extends false finally for function if import in instanceof let new null of return
    static super switch this throw true try typeof undefined var void while with yield`),
  PYTHON: words(`False None True and as assert async await break case class continue def del elif
    else except finally for from global if import in is lambda match nonlocal not or pass raise
    return try while with yield`),
};

/** Multi-character operators, longest first (single characters are taken as they come). */
const OPERATORS = [
  '>>>=',
  '<<=',
  '>>=',
  '>>>',
  '===',
  '!==',
  '**=',
  '//=',
  '...',
  '<=>',
  '&&=',
  '||=',
  '??=',
  '::',
  '->',
  '++',
  '--',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '//',
  '=>',
  '??',
  '?.',
  ':=',
];

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
const NUMBER =
  /(?:0[xXbBoO][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;
const PYTHON_STRING_PREFIX = /^(?:[rRuUbBfF]|[bB][rR]|[rR][bB]|[fF][rR]|[rR][fF])$/;
const WHITESPACE = /\s/;
const DIGIT = /[0-9]/;

function matchAt(pattern: RegExp, code: string, index: number): string | null {
  pattern.lastIndex = index;
  const match = pattern.exec(code);
  return match ? match[0] : null;
}

/**
 * End index (exclusive) of the string literal whose opening quote is at `start`. Unterminated
 * literals end at the line end (single-line kinds) or at the end of the code.
 */
function scanString(code: string, start: number, lang: Language): number {
  const quote = code[start];
  const triple = (lang === 'PYTHON' || lang === 'JAVA') && code.startsWith(quote.repeat(3), start);
  const multiline = triple || quote === '`';
  const closing = triple ? quote.repeat(3) : quote;
  let i = start + closing.length;
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (code.startsWith(closing, i)) return i + closing.length;
    if (c === '\n' && !multiline) return i;
    i += 1;
  }
  return code.length;
}

/** Tokens of `code` in source order (never throws; unknown characters become operators). */
export function tokenize(lang: Language, code: string): Token[] {
  const keywords = KEYWORDS[lang];
  const cStyleComments = lang !== 'PYTHON';
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;

  const advanceTo = (end: number) => {
    for (let j = i; j < end; j += 1) if (code[j] === '\n') line += 1;
    i = end;
  };

  while (i < code.length) {
    const c = code[i];
    if (WHITESPACE.test(c)) {
      advanceTo(i + 1);
      continue;
    }
    // Comments.
    if (cStyleComments && code.startsWith('//', i)) {
      const end = code.indexOf('\n', i);
      advanceTo(end === -1 ? code.length : end);
      continue;
    }
    if (cStyleComments && code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2);
      advanceTo(end === -1 ? code.length : end + 2);
      continue;
    }
    if (!cStyleComments && c === '#') {
      const end = code.indexOf('\n', i);
      advanceTo(end === -1 ? code.length : end);
      continue;
    }
    // String and char literals.
    if (c === '"' || c === "'" || (c === '`' && lang === 'JAVASCRIPT')) {
      tokens.push({ kind: 'S', line });
      advanceTo(scanString(code, i, lang));
      continue;
    }
    // Numbers (".5" too).
    if (DIGIT.test(c) || (c === '.' && DIGIT.test(code[i + 1] ?? ''))) {
      const number = matchAt(NUMBER, code, i) ?? c;
      tokens.push({ kind: 'N', line });
      advanceTo(i + number.length);
      continue;
    }
    // Identifiers, keywords and Python string prefixes (f"...", rb'...').
    const word = matchAt(IDENTIFIER, code, i);
    if (word) {
      const next = code[i + word.length];
      if (lang === 'PYTHON' && (next === '"' || next === "'") && PYTHON_STRING_PREFIX.test(word)) {
        tokens.push({ kind: 'S', line });
        advanceTo(scanString(code, i + word.length, lang));
        continue;
      }
      tokens.push({ kind: keywords.has(word) ? word : 'I', line });
      advanceTo(i + word.length);
      continue;
    }
    // Operators and punctuation.
    const operator = OPERATORS.find((op) => code.startsWith(op, i)) ?? c;
    tokens.push({ kind: operator, line });
    advanceTo(i + operator.length);
  }
  return tokens;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const encoder = new TextEncoder();

/** 64-bit FNV-1a over the UTF-8 bytes of `text`. */
export function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET;
  for (const byte of encoder.encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/**
 * Positions selected by winnowing: in each window of `w` consecutive hashes keep the minimum
 * (rightmost on ties), recording each position once. Fewer than `w` hashes form one window.
 */
export function winnow(hashes: readonly bigint[], w: number): number[] {
  if (hashes.length === 0) return [];
  const width = Math.min(Math.max(1, w), hashes.length);
  const selected: number[] = [];
  for (let start = 0; start + width <= hashes.length; start += 1) {
    let best = start;
    for (let j = start + 1; j < start + width; j += 1) {
      if (hashes[j] <= hashes[best]) best = j;
    }
    if (selected[selected.length - 1] !== best) selected.push(best);
  }
  return selected;
}

/** Winnowed k-gram fingerprints. A program with fewer than k tokens gets one fingerprint. */
export function fingerprints(
  tokens: readonly Token[],
  k: number = DEFAULT_K,
  w: number = DEFAULT_W,
): Fingerprint[] {
  if (tokens.length === 0) return [];
  const gram = Math.min(Math.max(1, k), tokens.length);
  const grams: Fingerprint[] = [];
  for (let start = 0; start + gram <= tokens.length; start += 1) {
    const slice = tokens.slice(start, start + gram);
    const hash = fnv1a64(slice.map((t) => t.kind).join(' '));
    const lines = [...new Set(slice.map((t) => t.line))].sort((a, b) => a - b);
    grams.push({ hash, lines });
  }
  return winnow(
    grams.map((g) => g.hash),
    w,
  ).map((position) => grams[position]);
}

const hashSet = (prints: readonly Fingerprint[]) => new Set(prints.map((p) => p.hash));

/** |FA ∩ FB| / min(|FA|, |FB|) over distinct hashes; 0 when either side is empty. */
export function similarity(fa: readonly Fingerprint[], fb: readonly Fingerprint[]): number {
  const a = hashSet(fa);
  const b = hashSet(fb);
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const hash of a) if (b.has(hash)) shared += 1;
  return shared / smaller;
}

const coveredLines = (prints: readonly Fingerprint[], other: ReadonlySet<bigint>) =>
  [...new Set(prints.filter((p) => other.has(p.hash)).flatMap((p) => p.lines))].sort(
    (x, y) => x - y,
  );

/** Lines (ascending, distinct) covered by the fingerprints both sides share. */
export function matchedLines(
  fa: readonly Fingerprint[],
  fb: readonly Fingerprint[],
): { a: number[]; b: number[] } {
  return { a: coveredLines(fa, hashSet(fb)), b: coveredLines(fb, hashSet(fa)) };
}
