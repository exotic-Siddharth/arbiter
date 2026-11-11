// npm run judge:refs: judges every reference program of seed/problems through the REAL API.
//
//   ref.cpp  -> CPP    expects AC
//   ref.py   -> PYTHON expects AC
//   slow.py  -> PYTHON expects TLE (when the problem ships one)
//   wrong.py -> PYTHON expects WA  (when the problem ships one)
//
// Afterwards it runs one plagiarism report on the seeded contest through the queue and worker.
// It logs in as the seeded admin, submits through POST /api/submissions, polls
// GET /api/submissions/:id until the verdict, prints a table and the queue-to-verdict latency
// (judgedAt - createdAt) per language, and exits 1 on any unexpected verdict.
//
// Needs the API and the worker running on a seeded database (npm run db:seed) and the sandbox
// image. Start the API with RATE_LIMITS_ENABLED=false (R2): the submission limit is 6 per minute
// per user. The submissions belong to the admin user; run `npm run db:seed` afterwards for a clean
// database.
//
//   npm run judge:refs -- [--api=http://localhost:4000] [--only=slug,slug] [--inflight=2]
//                         [--timeout=600] [--user=admin] [--password=...]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SubmissionDetailSchema, type SubmissionDetail } from '@arbiter/shared';
import { REPO_ROOT, apiEnvValue } from './lib/api-env';

type Language = 'CPP' | 'PYTHON';
type Expected = 'AC' | 'TLE' | 'WA';

interface Job {
  slug: string;
  file: 'ref.cpp' | 'ref.py' | 'slow.py' | 'wrong.py';
  language: Language;
  expected: Expected;
  sourceCode: string;
}

interface Outcome {
  job: Job;
  detail: SubmissionDetail | null;
  error?: string;
}

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split('=');
      return [key, rest.join('=')] as const;
    }),
);
const API = (args.get('api') ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const ONLY = args.get('only')?.split(',').filter(Boolean);
const IN_FLIGHT = Number(args.get('inflight') ?? 2);
const TIMEOUT_MS = Number(args.get('timeout') ?? 600) * 1000;
const USERNAME = args.get('user') ?? 'admin';
const PASSWORD = args.get('password') ?? apiEnvValue('SEED_ADMIN_PASSWORD', 'admin12345');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The access token expires after 15 minutes: callers pass any non-null token, call() uses this one. */
const session: { token: string | null; refreshing: Promise<boolean> | null } = {
  token: null,
  refreshing: null,
};

/** Log in as USERNAME and keep the access token in `session`; false when the login is refused. */
async function login(): Promise<boolean> {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: USERNAME, password: PASSWORD }),
  });
  const json = (await response.json().catch(() => null)) as { accessToken?: string } | null;
  if (response.status !== 200 || !json?.accessToken) return false;
  session.token = json.accessToken;
  return true;
}

async function call<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
  retry = 0,
): Promise<{ status: number; json: T }> {
  const response = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${session.token ?? token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && token && retry < 20) {
    // Expired access token: log in again once (shared by concurrent callers) and retry.
    session.refreshing ??= login().finally(() => {
      session.refreshing = null;
    });
    if (await session.refreshing) return call(method, path, token, body, retry + 1);
  }
  if (response.status === 429 && retry < 20) {
    const wait = Number(response.headers.get('retry-after') ?? 10);
    console.error(
      `  rate limited, waiting ${wait}s (start the API with RATE_LIMITS_ENABLED=false)`,
    );
    await sleep(wait * 1000 + 250);
    return call(method, path, token, body, retry + 1);
  }
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : null) as T };
}

function collectJobs(): Job[] {
  const root = join(REPO_ROOT, 'seed', 'problems');
  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'meta.json')))
    .map((entry) => entry.name)
    .filter((slug) => !ONLY || ONLY.includes(slug))
    .sort();
  const jobs: Job[] = [];
  const add = (slug: string, file: Job['file'], language: Language, expected: Expected) => {
    const path = join(root, slug, file);
    if (existsSync(path)) {
      jobs.push({ slug, file, language, expected, sourceCode: readFileSync(path, 'utf8') });
    }
  };
  for (const slug of slugs) {
    add(slug, 'ref.cpp', 'CPP', 'AC');
    add(slug, 'ref.py', 'PYTHON', 'AC');
    add(slug, 'slow.py', 'PYTHON', 'TLE');
    add(slug, 'wrong.py', 'PYTHON', 'WA');
  }
  return jobs;
}

async function judge(job: Job, token: string): Promise<Outcome> {
  const created = await call<{ submission?: { id: string }; error?: { message: string } }>(
    'POST',
    '/submissions',
    token,
    { problemSlug: job.slug, language: job.language, sourceCode: job.sourceCode },
  );
  if (created.status !== 202 || !created.json.submission) {
    return {
      job,
      detail: null,
      error: `POST /submissions answered ${created.status}: ${created.json.error?.message ?? ''}`,
    };
  }
  const id = created.json.submission.id;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await call<unknown>('GET', `/submissions/${id}`, token);
    if (res.status === 200) {
      const detail = SubmissionDetailSchema.parse(res.json);
      if (detail.status === 'DONE' || detail.status === 'FAILED') return { job, detail };
    } else if (res.status !== 404) {
      return { job, detail: null, error: `GET /submissions/${id} answered ${res.status}` };
    }
    await sleep(400);
  }
  return { job, detail: null, error: `no verdict after ${TIMEOUT_MS / 1000}s` };
}

const verdictOf = (outcome: Outcome): string =>
  outcome.detail ? (outcome.detail.verdict ?? outcome.detail.status) : 'ERR';
const isOk = (outcome: Outcome): boolean => verdictOf(outcome) === outcome.job.expected;
const latencyMs = (detail: SubmissionDetail): number | null =>
  detail.judgedAt ? Date.parse(detail.judgedAt) - Date.parse(detail.createdAt) : null;

/** Nearest-rank percentile, the same rule as the admin monitor. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function cell(outcome: Outcome | undefined): string {
  if (!outcome) return '-';
  const verdict = verdictOf(outcome);
  const detail = outcome.detail;
  const timing = detail
    ? ` ${detail.testsPassed}/${detail.testsTotal}, ${((latencyMs(detail) ?? 0) / 1000).toFixed(1)} s`
    : '';
  return `${isOk(outcome) ? '' : 'FAIL '}${verdict}${timing}`;
}

/** Runs a plagiarism report for the seeded ended contest through the real queue and worker (POST, then poll). */
async function checkPlagiarismQueue(token: string): Promise<string | null> {
  const contests = await call<{ items?: { id: string; slug: string }[] }>(
    'GET',
    '/admin/contests?pageSize=100',
    token,
  );
  const contest = contests.json.items?.find((c) => c.slug === 'arbiter-round-1');
  if (!contest) return 'the seeded contest arbiter-round-1 was not found (run npm run db:seed)';
  const created = await call<{ reportId?: string }>('POST', '/admin/plagiarism', token, {
    contestId: contest.id,
    threshold: 0.6,
  });
  if (created.status !== 202 || !created.json.reportId) {
    return `POST /admin/plagiarism answered ${created.status}`;
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const report = await call<{ status?: string; error?: string | null; pairs?: unknown[] }>(
      'GET',
      `/admin/plagiarism/${created.json.reportId}`,
      token,
    );
    if (report.json.status === 'DONE') {
      const pairs = report.json.pairs?.length ?? 0;
      console.log(`Plagiarism report through the queue: DONE with ${pairs} pairs.`);
      return pairs >= 2 ? null : `expected at least 2 plagiarised pairs, got ${pairs}`;
    }
    if (report.json.status === 'FAILED') return `report FAILED: ${report.json.error ?? ''}`;
    await sleep(500);
  }
  return 'the plagiarism report did not finish in 120 s';
}

async function main(): Promise<void> {
  const jobs = collectJobs();
  if (jobs.length === 0) throw new Error('No reference programs found under seed/problems');
  if (!(await login())) {
    throw new Error(
      `Login as ${USERNAME} failed: is the API up on ${API} and the database seeded?`,
    );
  }
  const token = session.token as string;
  console.log(`Judging ${jobs.length} programs through ${API}, ${IN_FLIGHT} in flight...`);

  const outcomes: Outcome[] = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: Math.max(1, IN_FLIGHT) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next];
        next += 1;
        const outcome = await judge(job, token);
        outcomes.push(outcome);
        console.log(
          `  ${outcomes.length}/${jobs.length} ${job.slug}/${job.file}: ${cell(outcome)} (expected ${job.expected})`,
        );
      }
    }),
  );
  const wallSeconds = (Date.now() - started) / 1000;

  const find = (slug: string, file: Job['file']) =>
    outcomes.find((o) => o.job.slug === slug && o.job.file === file);
  const slugs = [...new Set(jobs.map((j) => j.slug))];
  const rows = slugs.map((slug) => [
    slug,
    cell(find(slug, 'ref.cpp')),
    cell(find(slug, 'ref.py')),
    cell(find(slug, 'slow.py')),
    cell(find(slug, 'wrong.py')),
  ]);
  const header = ['problem', 'ref.cpp (AC)', 'ref.py (AC)', 'slow.py (TLE)', 'wrong.py (WA)'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  console.log('');
  console.log(line(header));
  console.log(`|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`);
  rows.forEach((row) => console.log(line(row)));

  console.log('');
  console.log('Queue-to-verdict latency (judgedAt - createdAt), nearest-rank percentiles:');
  console.log('| language | programs | median | p95 | max |');
  console.log('|---|---|---|---|---|');
  for (const language of ['CPP', 'PYTHON'] as const) {
    const values = outcomes
      .filter((o) => o.job.language === language && o.detail)
      .map((o) => latencyMs(o.detail as SubmissionDetail))
      .filter((v): v is number => v !== null);
    if (values.length === 0) continue;
    console.log(
      `| ${language} | ${values.length} | ${percentile(values, 50)} ms | ${percentile(values, 95)} ms | ${Math.max(...values)} ms |`,
    );
  }
  const ac = outcomes
    .filter((o) => o.job.expected === 'AC' && o.detail)
    .map((o) => latencyMs(o.detail as SubmissionDetail))
    .filter((v): v is number => v !== null);
  if (ac.length > 0) {
    console.log(
      `| AC only (both languages) | ${ac.length} | ${percentile(ac, 50)} ms | ${percentile(ac, 95)} ms | ${Math.max(...ac)} ms |`,
    );
  }
  console.log(`Wall time ${wallSeconds.toFixed(1)} s for ${outcomes.length} submissions.`);

  const plagiarismProblem = ONLY ? null : await checkPlagiarismQueue(token);
  const failed = outcomes.filter((o) => !isOk(o));
  if (plagiarismProblem) {
    console.error(`
Plagiarism queue check failed: ${plagiarismProblem}`);
    process.exitCode = 1;
  }
  if (failed.length > 0) {
    console.error(
      `\n${failed.length} of ${outcomes.length} programs did not get the expected verdict:`,
    );
    for (const o of failed) {
      console.error(
        `  ${o.job.slug}/${o.job.file}: expected ${o.job.expected}, got ${verdictOf(o)}${o.error ? ` (${o.error})` : ''}` +
          `${o.detail?.compileOutput ? `\n    compile: ${o.detail.compileOutput.slice(0, 300)}` : ''}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${outcomes.length} programs got the expected verdict.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
