// Type-only imports: common.ts imports LIMITS from this file at runtime.
import type { Difficulty, Language, SubmissionStatus, Verdict } from './common';

/** Byte/size limits shared by the API validation and the UI. */
export const LIMITS = {
  /** Source code of a submission or run, UTF-8 bytes. */
  sourceCodeBytes: 65536,
  /** Custom run input, UTF-8 bytes. */
  runInputBytes: 65536,
  pageSizeMax: 100,
  pageSizeDefault: 20,
  bioMaxChars: 280,
  usernameMinChars: 3,
  usernameMaxChars: 20,
  passwordMinChars: 8,
  passwordMaxChars: 128,
  /** One test-case input or expected output, UTF-8 bytes. */
  testDataBytes: 4 * 1024 * 1024,
  /** Max tests per bulk upload request. */
  bulkTestsMax: 200,
  /** Characters of input/expected output shown in the admin test list. */
  testPreviewChars: 256,
  compileOutputBytes: 16 * 1024,
  /** Run-mode stdout shown to the user. */
  runStdoutBytes: 64 * 1024,
  stderrBytes: 2 * 1024,
  /** Stored stdout preview for sample tests. */
  sampleOutputPreviewBytes: 4 * 1024,
} as const;

export interface LanguageInfo {
  id: Language;
  /** Display name, e.g. "C++17 (g++)". */
  label: string;
  /** Monaco language id. */
  monacoId: string;
  /** File name inside the sandbox; also shown in the editor tab. */
  fileName: string;
  /** Starter code: reads all of stdin and prints. */
  template: string;
}

const lines = (...rows: string[]) => rows.join('\n') + '\n';

export const LANGUAGES: Record<Language, LanguageInfo> = {
  CPP: {
    id: 'CPP',
    label: 'C++17 (g++)',
    monacoId: 'cpp',
    fileName: 'main.cpp',
    template: lines(
      '#include <bits/stdc++.h>',
      'using namespace std;',
      '',
      'int main() {',
      '    ios::sync_with_stdio(false);',
      '    cin.tie(nullptr);',
      '',
      '    // Read every token from stdin, then print your answer to stdout.',
      '    vector<string> tokens;',
      '    string token;',
      '    while (cin >> token) {',
      '        tokens.push_back(token);',
      '    }',
      '',
      '    for (size_t i = 0; i < tokens.size(); i++) {',
      "        if (i > 0) cout << ' ';",
      '        cout << tokens[i];',
      '    }',
      "    cout << '\\n';",
      '    return 0;',
      '}',
    ),
  },
  PYTHON: {
    id: 'PYTHON',
    label: 'Python 3.11',
    monacoId: 'python',
    fileName: 'main.py',
    template: lines(
      'import sys',
      '',
      '',
      'def main() -> None:',
      '    data = sys.stdin.read().split()',
      '    # Parse the tokens in `data`, then print your answer.',
      '    print(" ".join(data))',
      '',
      '',
      'if __name__ == "__main__":',
      '    main()',
    ),
  },
  JAVA: {
    id: 'JAVA',
    label: 'Java 17',
    monacoId: 'java',
    fileName: 'Main.java',
    template: lines(
      'import java.io.BufferedReader;',
      'import java.io.IOException;',
      'import java.io.InputStreamReader;',
      'import java.util.ArrayList;',
      'import java.util.List;',
      'import java.util.StringTokenizer;',
      '',
      'public class Main {',
      '    public static void main(String[] args) throws IOException {',
      '        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));',
      '        List<String> tokens = new ArrayList<>();',
      '        String line;',
      '        while ((line = in.readLine()) != null) {',
      '            StringTokenizer st = new StringTokenizer(line);',
      '            while (st.hasMoreTokens()) {',
      '                tokens.add(st.nextToken());',
      '            }',
      '        }',
      '',
      '        // Parse the tokens, then print your answer.',
      '        System.out.println(String.join(" ", tokens));',
      '    }',
      '}',
    ),
  },
  JAVASCRIPT: {
    id: 'JAVASCRIPT',
    label: 'JavaScript (Node 18)',
    monacoId: 'javascript',
    fileName: 'main.js',
    template: lines(
      'const data = require("fs").readFileSync(0, "utf8");',
      'const tokens = data.split(/\\s+/).filter(Boolean);',
      '',
      '// Parse the tokens, then print your answer.',
      'console.log(tokens.join(" "));',
    ),
  },
};

export interface VerdictInfo {
  code: Verdict;
  label: string;
  /** Hex colour from spec section 13.1. */
  color: string;
  /** CSS token suffix: the web theme defines --color-<token>. */
  token: string;
}

export const VERDICTS: Record<Verdict, VerdictInfo> = {
  AC: { code: 'AC', label: 'Accepted', color: '#22c55e', token: 'verdict-ac' },
  WA: { code: 'WA', label: 'Wrong Answer', color: '#f43f5e', token: 'verdict-wa' },
  TLE: { code: 'TLE', label: 'Time Limit Exceeded', color: '#f59e0b', token: 'verdict-tle' },
  MLE: { code: 'MLE', label: 'Memory Limit Exceeded', color: '#f97316', token: 'verdict-mle' },
  RE: { code: 'RE', label: 'Runtime Error', color: '#d946ef', token: 'verdict-re' },
  CE: { code: 'CE', label: 'Compilation Error', color: '#38bdf8', token: 'verdict-ce' },
  OLE: { code: 'OLE', label: 'Output Limit Exceeded', color: '#eab308', token: 'verdict-ole' },
  IE: { code: 'IE', label: 'Internal Error', color: '#94a3b8', token: 'verdict-ie' },
};

/** Colour for queued/compiling/running submissions and pending scoreboard cells. */
export const PENDING_STYLE = {
  label: 'Pending',
  color: '#a1a1aa',
  token: 'verdict-pending',
} as const;

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  QUEUED: 'Queued',
  COMPILING: 'Compiling',
  RUNNING: 'Running',
  DONE: 'Judged',
  FAILED: 'Judge failed',
};

export interface DifficultyInfo {
  id: Difficulty;
  label: string;
  color: string;
  token: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyInfo> = {
  EASY: { id: 'EASY', label: 'Easy', color: '#14b8a6', token: 'difficulty-easy' },
  MEDIUM: { id: 'MEDIUM', label: 'Medium', color: '#f59e0b', token: 'difficulty-medium' },
  HARD: { id: 'HARD', label: 'Hard', color: '#f43f5e', token: 'difficulty-hard' },
};

export interface RatingTier {
  name: 'Initiate' | 'Apprentice' | 'Adept' | 'Expert' | 'Master' | 'Grandmaster';
  /** Inclusive lower bound (null = no lower bound). */
  min: number | null;
  /** Exclusive upper bound (null = no upper bound). */
  max: number | null;
  color: 'gray' | 'green' | 'cyan' | 'blue' | 'violet' | 'amber';
  hex: string;
}

/** Spec section 13.1 rating tiers, lowest first. */
export const RATING_TIERS: readonly RatingTier[] = [
  { name: 'Initiate', min: null, max: 1200, color: 'gray', hex: '#9ca3af' },
  { name: 'Apprentice', min: 1200, max: 1400, color: 'green', hex: '#22c55e' },
  { name: 'Adept', min: 1400, max: 1600, color: 'cyan', hex: '#22d3ee' },
  { name: 'Expert', min: 1600, max: 1900, color: 'blue', hex: '#3b82f6' },
  { name: 'Master', min: 1900, max: 2200, color: 'violet', hex: '#8b5cf6' },
  { name: 'Grandmaster', min: 2200, max: null, color: 'amber', hex: '#f59e0b' },
];

export const DEFAULT_RATING = 1200;

export function getRatingTier(rating: number): RatingTier {
  const tier = RATING_TIERS.find(
    (t) => (t.min === null || rating >= t.min) && (t.max === null || rating < t.max),
  );
  // The tiers cover the whole number line, so find() always succeeds.
  return tier ?? RATING_TIERS[0];
}
