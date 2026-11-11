import { chance, int, pick, type Rng } from './rng';

/**
 * Source-code variants for the seeded submission history. Historical submissions are inserted
 * with verdicts and are never judged (spec section 14), but their sources should look like
 * different people's programs. The reference programs are the only correct sources we have, so
 * every submission gets its own copy of one with harmless debug scaffolding between statements.
 * Winnowing hashes token kinds (every identifier is "I"), so renaming alone would not make two
 * copies look different; the scaffolding changes the token sequence, while removing the inserted
 * lines gives back the original program.
 */

export type SeedLanguage = 'CPP' | 'PYTHON';

export interface DiversifyOptions {
  /** Probability that a statement boundary gets scaffolding (default 0.9). */
  density?: number;
  /** Add the DEBUG / kDebug constant the scaffolding refers to (default true). */
  header?: boolean;
}

const PY_HEADER = 'DEBUG = False';
const CPP_HEADER = 'static const bool kDebug = false;';

const PY_ARGS = [
  '"x"',
  '1',
  '0',
  'DEBUG',
  'None',
  '[]',
  '(1, 2)',
  'len("ab")',
  '2 + 3',
  '"%d" % 7',
];
const CPP_ARGS = [
  '"x"',
  '1',
  "'\\n'",
  'kDebug',
  'sizeof(int)',
  '2 + 3',
  '0',
  '"a" "b"',
  '(1 << 2)',
];

/** A random harmless Python statement. The shape (argument count and kinds) varies, so two copies rarely share any. */
function pythonJunk(rng: Rng, useSys: boolean): string {
  const args = Array.from({ length: int(rng, 1, 4) }, () => pick(rng, PY_ARGS));
  switch (int(rng, 0, useSys ? 3 : 2)) {
    case 0:
      return 'pass';
    case 1:
      return `assert ${pick(rng, ['True', '1', 'DEBUG or 1', 'not None'])}`;
    case 2:
      return `if DEBUG: print(${args.join(', ')})`;
    default:
      return `if DEBUG: print(${args.join(', ')}, file=sys.stderr)`;
  }
}

/** A random harmless C++ statement (the constants and streams come from bits/stdc++.h). */
function cppJunk(rng: Rng): string {
  const args = Array.from({ length: int(rng, 1, 4) }, () => pick(rng, CPP_ARGS));
  switch (int(rng, 0, 3)) {
    case 0:
      return '(void)kDebug;';
    case 1:
      return `if (kDebug) cerr << ${args.join(' << ')};`;
    case 2:
      return `if (kDebug) { cerr << ${args.join(' << ')} << endl; }`;
    default:
      return `(void)(${pick(rng, CPP_ARGS)});`;
  }
}

const indentOf = (line: string) => /^[ \t]*/.exec(line)?.[0] ?? '';
const STRING_LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;

/** Python source with scaffolding lines inserted at safe statement boundaries. */
function diversifyPython(source: string, rng: Rng, density: number, header: boolean): string {
  const useSys = /^import sys\b/m.test(source);
  const lines = source.split('\n');
  const lastImport = lines.reduce(
    (last, line, i) => (/^(import|from)\s/.test(line) ? i : last),
    -1,
  );
  const out: string[] = [];
  let depth = 0;
  let inTriple = false;
  let continued = false;
  lines.forEach((line, i) => {
    const stripped = line.trim();
    const safe =
      !inTriple &&
      !continued &&
      depth === 0 &&
      stripped !== '' &&
      !stripped.startsWith('#') &&
      !/^(else|elif|except|finally)\b/.test(stripped) &&
      !/^[)\]}]/.test(stripped) &&
      i > lastImport;
    if (safe && chance(rng, density)) {
      const count = chance(rng, 0.3) ? 2 : 1;
      for (let n = 0; n < count; n += 1) out.push(indentOf(line) + pythonJunk(rng, useSys));
    }
    out.push(line);
    const code = line.replace(/#.*$/, '');
    if ((code.match(/"""|'''/g) ?? []).length % 2 === 1) inTriple = !inTriple;
    if (!inTriple) {
      const flat = code.replace(STRING_LITERAL, '');
      for (const ch of flat) {
        if ('([{'.includes(ch)) depth += 1;
        else if (')]}'.includes(ch)) depth -= 1;
      }
      continued = flat.trimEnd().endsWith('\\');
    }
    if (header && i === lastImport) out.push('', PY_HEADER);
  });
  if (header && lastImport < 0) out.unshift(PY_HEADER);
  return out.join('\n');
}

type BraceKind = 'code' | 'type' | 'init';

/** C++ source with scaffolding statements inserted at statement boundaries inside function bodies. */
function diversifyCpp(source: string, rng: Rng, density: number, header: boolean): string {
  const lines = source.split('\n');
  const lastPreamble = lines.reduce(
    (last, line, i) => (/^\s*(#include|using\s+namespace)\b/.test(line) ? i : last),
    -1,
  );
  const out: string[] = [];
  const stack: BraceKind[] = [];
  let parens = 0;
  let pending = '';
  let prevEnd = '';
  lines.forEach((line, i) => {
    const stripped = line.trim();
    const safe =
      stack[stack.length - 1] === 'code' &&
      parens === 0 &&
      stripped !== '' &&
      !stripped.startsWith('#') &&
      !stripped.startsWith('//') &&
      !/^(else|catch|case|default)\b/.test(stripped) &&
      !stripped.startsWith(')') &&
      ['{', '}', ';'].includes(prevEnd);
    if (safe && chance(rng, density)) {
      const count = chance(rng, 0.3) ? 2 : 1;
      for (let n = 0; n < count; n += 1) out.push(indentOf(line) + cppJunk(rng));
    }
    out.push(line);
    if (header && i === lastPreamble) out.push('', CPP_HEADER);
    if (stripped.startsWith('#')) return;
    const code = line
      .replace(STRING_LITERAL, '""')
      .replace(/\/\/.*$/, '')
      .trimEnd();
    for (const ch of code) {
      if (ch === '(') parens += 1;
      else if (ch === ')') parens -= 1;
      else if (ch === '{') {
        const text = pending.trimEnd();
        if (/\b(struct|class|enum|union|namespace)\b/.test(text)) stack.push('type');
        else if (/[=,(]$/.test(text) || /\breturn$/.test(text)) stack.push('init');
        else stack.push('code');
        pending = '';
      } else if (ch === '}') {
        stack.pop();
        pending = '';
      } else if (ch === ';') pending = '';
      else pending += ch;
    }
    pending += ' ';
    if (code !== '') prevEnd = code.slice(-1);
  });
  if (header && lastPreamble < 0) out.unshift(CPP_HEADER);
  return out.join('\n');
}

/** A copy of `source` with scaffolding statements; deleting them restores `source`. */
export function diversify(
  source: string,
  language: SeedLanguage,
  rng: Rng,
  options: DiversifyOptions = {},
): string {
  const density = options.density ?? 0.9;
  const header = options.header ?? true;
  return language === 'PYTHON'
    ? diversifyPython(source, rng, density, header)
    : diversifyCpp(source, rng, density, header);
}

/** True when a line is scaffolding added by `diversify` (lets tests check that removing it restores the source). */
export function isScaffolding(line: string, language: SeedLanguage): boolean {
  const text = line.trim();
  if (language === 'PYTHON') {
    return (
      text === PY_HEADER ||
      text === 'pass' ||
      /^assert (True|1|DEBUG or 1|not None)$/.test(text) ||
      /^if DEBUG: print\(.*\)$/.test(text)
    );
  }
  return (
    text === CPP_HEADER ||
    text === '(void)kDebug;' ||
    /^\(void\)\(.*\);$/.test(text) ||
    /^if \(kDebug\) (\{ )?cerr << .*;( \})?$/.test(text)
  );
}

const WORDS: Record<SeedLanguage, RegExp> = {
  PYTHON: /#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[A-Za-z_]\w*/g,
  CPP: /\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[A-Za-z_]\w*/g,
};

/** Rename identifiers (whole words outside comments and string literals): the classic copy-and-rename edit. */
export function renameIdentifiers(
  source: string,
  language: SeedLanguage,
  renames: Readonly<Record<string, string>>,
): string {
  return source.replace(WORDS[language], (match) =>
    Object.hasOwn(renames, match) ? renames[match] : match,
  );
}

/**
 * A plagiarised copy: identifiers renamed and a sprinkle of extra scaffolding, nothing else
 * changed. Winnowing still sees almost the same token sequence.
 */
export function plagiarise(
  source: string,
  language: SeedLanguage,
  renames: Readonly<Record<string, string>>,
  rng: Rng,
): string {
  return diversify(renameIdentifiers(source, language, renames), language, rng, {
    density: 0.08,
    header: false,
  });
}

export interface BrokenSource {
  source: string;
  compileOutput: string;
}

/** A source that does not compile, with a plausible compiler message (Python: SyntaxError; C++: missing semicolon). */
export function breakSource(source: string, language: SeedLanguage, rng: Rng): BrokenSource {
  const lines = source.split('\n');
  if (language === 'PYTHON') {
    const candidates = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\(.*\)\s*$/.test(line) && !line.trim().startsWith('#'));
    if (candidates.length === 0) {
      return {
        source: `${source}\nprint(`,
        compileOutput: `  File "main.py", line ${lines.length + 1}\n    print(\n         ^\nSyntaxError: '(' was never closed\n`,
      };
    }
    const { line, index } = pick(rng, candidates);
    const cut = line.lastIndexOf(')');
    lines[index] = line.slice(0, cut) + line.slice(cut + 1);
    const open = line.indexOf('(');
    return {
      source: lines.join('\n'),
      compileOutput:
        `  File "main.py", line ${index + 1}\n    ${lines[index].trim()}\n` +
        `${' '.repeat(4 + open - indentOf(line).length)}^\nSyntaxError: '(' was never closed\n`,
    };
  }
  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line, index }) =>
        /;\s*$/.test(line) &&
        !line.includes('for (') &&
        index < lines.length - 1 &&
        /^[ \t]+\S/.test(line),
    );
  if (candidates.length === 0) {
    return {
      source: `${source}\nint broken( {\n`,
      compileOutput: `main.cpp:${lines.length + 1}:13: error: expected primary-expression before '{' token\n`,
    };
  }
  const { line, index } = pick(rng, candidates);
  const cut = line.lastIndexOf(';');
  lines[index] = line.slice(0, cut) + line.slice(cut + 1);
  const nextLine = lines.slice(index + 1).find((l) => l.trim() !== '') ?? '}';
  const word = /^\s*([A-Za-z_]\w*)/.exec(nextLine)?.[1];
  const token = word ? `'${word}'` : `'${nextLine.trim()[0]}' token`;
  const pad = ' '.repeat(cut + 1);
  return {
    source: lines.join('\n'),
    compileOutput:
      `main.cpp: In function 'int main()':\n` +
      `main.cpp:${index + 1}:${cut + 1}: error: expected ';' before ${token}\n` +
      `   ${String(index + 1).padStart(3)} | ${lines[index]}\n      | ${pad.slice(0, Math.max(0, cut))}^\n` +
      `      | ${pad.slice(0, Math.max(0, cut))};\n`,
  };
}
