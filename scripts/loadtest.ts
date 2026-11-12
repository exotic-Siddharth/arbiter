// npm run loadtest (spec section 15): N concurrent virtual users submit real reference solutions
// through the REAL API and the report is a markdown table. Two phases:
//
//   judge  Each virtual user (VU) is a freshly registered account that keeps ONE submission in
//          flight at a time (closed loop): POST /api/submissions, poll GET /api/submissions/:id
//          until DONE or FAILED, repeat. The programs are the seed reference solutions (ref.cpp and
//          ref.py of every published problem, the same files `npm run judge:refs` uses), in a fixed order, so
//          a run is repeatable. Reported per user level: judged/min (submissions / wall minutes),
//          queue-to-verdict latency (judgedAt - createdAt as stored by the worker) p50/p95/max,
//          the latency the client saw (submit sent -> verdict seen), non-AC count, and the machine's
//          CPU busy % (os.cpus() tick deltas) during the run.
//   reads  Latency (p50/p95/max) and requests/s of the hot public GET endpoints (problem list,
//          problem detail, scoreboard page of an ended and of the running contest, leaderboard,
//          landing stats), at one or more concurrency levels, using Node's built-in fetch.
//
// Needs the API and the worker running on a seeded database and the sandbox image. Start the API
// with RATE_LIMITS_ENABLED=false (R2: it is refused in production): the load test registers its
// users from one IP and submits far faster than 6 per minute per user.
//
// The VUs are new accounts named lt<run id>_<n>. They stay in the database (and add to the
// problems' submission counters), so point this at a throwaway database, not at demo data.
//
//   npm run loadtest -- [--phase=judge|reads|all] [--api=http://localhost:4000]
//       [--users=2,8] [--per-user=4] [--warmup=2] [--repeat=3] [--timeout=600]
//       [--read-requests=400] [--read-concurrency=1,8] [--read-warmup=50] [--read-repeat=3]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/api-env';

type Language = 'CPP' | 'PYTHON';

interface Program {
  slug: string;
  language: Language;
  sourceCode: string;
}

interface Sample {
  language: Language;
  verdict: string;
  /** judgedAt - createdAt, both stamped on the server side (API insert, worker update). */
  serverMs: number | null;
  /** Client clock: POST sent -> verdict first seen by polling. */
  clientMs: number;
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
const intList = (name: string, fallback: string): number[] =>
  (args.get(name) ?? fallback)
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
const intArg = (name: string, fallback: number): number => Number(args.get(name) ?? fallback);

const API = (args.get('api') ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const PHASE = args.get('phase') ?? 'all';
const USER_LEVELS = intList('users', '2,8');
const PER_USER = intArg('per-user', 4);
const WARMUP = intArg('warmup', 2);
const REPEAT = intArg('repeat', 3);
const TIMEOUT_MS = intArg('timeout', 600) * 1000;
const READ_REQUESTS = intArg('read-requests', 400);
const READ_CONCURRENCY = intList('read-concurrency', '1,8');
const READ_WARMUP = intArg('read-warmup', 50);
const READ_REPEAT = intArg('read-repeat', 3);
const PASSWORD = 'LoadTest-pass-2026';
const RUN_ID = Date.now().toString(36);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nearest-rank percentile, the same rule as the admin monitor and `npm run judge:refs`. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}
const median = (values: number[]): number => percentile(values, 50);
const fixed = (value: number, digits = 1): string => value.toFixed(digits);
const secs = (ms: number, digits = 2): string => (ms / 1000).toFixed(digits);
const range = (values: number[], digits = 1): string =>
  `${fixed(Math.min(...values), digits)} to ${fixed(Math.max(...values), digits)}`;

/** Whole-machine CPU busy % between a snapshot and now (os.cpus() tick counters). */
function cpuSnapshot(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}
function cpuBusy(from: { idle: number; total: number }): number {
  const to = cpuSnapshot();
  const total = to.total - from.total;
  return total <= 0 ? 0 : (100 * (total - (to.idle - from.idle))) / total;
}

async function api<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const response = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : null) as T };
}

/* ------------------------------------------------------------------------------------------ */
/* judge phase                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** Reference programs of the published problems (the only ones a plain user may submit to). */
async function collectPrograms(): Promise<Program[]> {
  const list = await api<{ items?: { slug: string }[] }>('GET', '/problems?pageSize=100', null);
  const published = new Set((list.json.items ?? []).map((item) => item.slug));
  const root = join(REPO_ROOT, 'seed', 'problems');
  const programs: Program[] = [];
  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'meta.json')))
    .map((entry) => entry.name)
    .filter((slug) => published.has(slug))
    .sort();
  for (const slug of slugs) {
    for (const [file, language] of [
      ['ref.cpp', 'CPP'],
      ['ref.py', 'PYTHON'],
    ] as const) {
      const path = join(root, slug, file);
      if (existsSync(path))
        programs.push({ slug, language, sourceCode: readFileSync(path, 'utf8') });
    }
  }
  return programs;
}

interface VirtualUser {
  token: string;
}

async function register(index: number): Promise<VirtualUser> {
  const name = `lt${RUN_ID}_${index}`;
  const response = await api<{ accessToken?: string }>('POST', '/auth/register', null, {
    email: `${name}@loadtest.invalid`,
    username: name,
    password: PASSWORD,
  });
  if (response.status !== 201 || !response.json.accessToken) {
    throw new Error(
      `register ${name} answered ${response.status} (start the API with RATE_LIMITS_ENABLED=false)`,
    );
  }
  return { token: response.json.accessToken };
}

/** Submit one program as `user` and wait for its verdict. */
async function judgeOne(user: VirtualUser, program: Program): Promise<Sample> {
  const started = performance.now();
  const created = await api<{ submission?: { id: string } }>('POST', '/submissions', user.token, {
    problemSlug: program.slug,
    language: program.language,
    sourceCode: program.sourceCode,
  });
  if (created.status !== 202 || !created.json.submission) {
    throw new Error(`POST /submissions answered ${created.status} for ${program.slug}`);
  }
  const id = created.json.submission.id;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await api<{
      status: string;
      verdict: string | null;
      createdAt: string;
      judgedAt: string | null;
    }>('GET', `/submissions/${id}`, user.token);
    if (res.status === 200 && (res.json.status === 'DONE' || res.json.status === 'FAILED')) {
      const { verdict, createdAt, judgedAt, status } = res.json;
      return {
        language: program.language,
        verdict: verdict ?? status,
        serverMs: judgedAt ? Date.parse(judgedAt) - Date.parse(createdAt) : null,
        clientMs: performance.now() - started,
      };
    }
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`GET /submissions/${id} answered ${res.status}`);
    }
    await sleep(250);
  }
  throw new Error(`no verdict for ${program.slug} (${program.language}) in ${TIMEOUT_MS / 1000} s`);
}

interface LevelResult {
  users: number;
  submissions: number;
  wallSeconds: number;
  judgedPerMin: number;
  serverP50: number;
  serverP95: number;
  serverMax: number;
  clientP50: number;
  clientP95: number;
  nonAc: number;
  cpu: number;
  byLanguage: Record<Language, { p50: number; p95: number } | null>;
}

async function runLevel(
  users: VirtualUser[],
  programs: Program[],
  cursor: { next: number },
): Promise<LevelResult> {
  const samples: Sample[] = [];
  const cpuStart = cpuSnapshot();
  const started = performance.now();
  await Promise.all(
    users.map(async (user) => {
      for (let i = 0; i < PER_USER; i += 1) {
        const program = programs[cursor.next % programs.length];
        cursor.next += 1;
        samples.push(await judgeOne(user, program));
      }
    }),
  );
  const wallSeconds = (performance.now() - started) / 1000;
  const cpu = cpuBusy(cpuStart);
  const server = samples.map((s) => s.serverMs).filter((v): v is number => v !== null);
  const client = samples.map((s) => s.clientMs);
  const byLanguage = (language: Language) => {
    const values = samples
      .filter((s) => s.language === language && s.serverMs !== null)
      .map((s) => s.serverMs as number);
    return values.length === 0
      ? null
      : { p50: percentile(values, 50), p95: percentile(values, 95) };
  };
  return {
    users: users.length,
    submissions: samples.length,
    wallSeconds,
    judgedPerMin: (samples.length / wallSeconds) * 60,
    serverP50: percentile(server, 50),
    serverP95: percentile(server, 95),
    serverMax: Math.max(...server),
    clientP50: percentile(client, 50),
    clientP95: percentile(client, 95),
    nonAc: samples.filter((s) => s.verdict !== 'AC').length,
    cpu,
    byLanguage: { CPP: byLanguage('CPP'), PYTHON: byLanguage('PYTHON') },
  };
}

async function judgePhase(): Promise<void> {
  const programs = await collectPrograms();
  if (programs.length === 0) throw new Error('No reference programs for the published problems');
  const maxUsers = Math.max(...USER_LEVELS);
  console.log(`Registering ${maxUsers} virtual users on ${API} ...`);
  const users: VirtualUser[] = [];
  for (let i = 0; i < maxUsers; i += 1) users.push(await register(i));

  const cursor = { next: 0 };
  if (WARMUP > 0) {
    console.log(`Warm-up: ${WARMUP} submissions per language, one at a time, not counted.`);
    for (const language of ['CPP', 'PYTHON'] as const) {
      const pool = programs.filter((p) => p.language === language);
      for (let i = 0; i < WARMUP; i += 1) await judgeOne(users[0], pool[i % pool.length]);
    }
  }

  const results: LevelResult[] = [];
  for (const level of USER_LEVELS) {
    for (let run = 1; run <= REPEAT; run += 1) {
      const result = await runLevel(users.slice(0, level), programs, cursor);
      results.push(result);
      console.log(
        `  ${level} users, run ${run}/${REPEAT}: ${result.submissions} judged in ${fixed(result.wallSeconds)} s, ` +
          `${fixed(result.judgedPerMin)}/min, p50 ${secs(result.serverP50)} s, p95 ${secs(result.serverP95)} s, ` +
          `${result.nonAc} non-AC, CPU ${fixed(result.cpu, 0)} %`,
      );
    }
  }

  console.log('');
  console.log(
    `### Judging: queue-to-verdict (judgedAt - createdAt), ${PER_USER} submissions per user per run, ` +
      `${REPEAT} runs per level`,
  );
  console.log('');
  console.log(
    '| users | run | submissions | wall s | judged/min | p50 s | p95 s | max s | client p50 s | client p95 s | non-AC | CPU % |',
  );
  console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const level of USER_LEVELS) {
    const rows = results.filter((r) => r.users === level);
    rows.forEach((r, index) =>
      console.log(
        `| ${level} | ${index + 1} | ${r.submissions} | ${fixed(r.wallSeconds)} | ${fixed(r.judgedPerMin)} | ` +
          `${secs(r.serverP50)} | ${secs(r.serverP95)} | ${secs(r.serverMax)} | ` +
          `${secs(r.clientP50)} | ${secs(r.clientP95)} | ${r.nonAc} | ${fixed(r.cpu, 0)} |`,
      ),
    );
    const col = (pick: (r: LevelResult) => number) => rows.map(pick);
    console.log(
      `| **${level}** | **median (range)** | ${rows[0].submissions} | ` +
        `${fixed(median(col((r) => r.wallSeconds)))} | ` +
        `${fixed(median(col((r) => r.judgedPerMin)))} (${range(col((r) => r.judgedPerMin))}) | ` +
        `${secs(median(col((r) => r.serverP50)))} (${range(
          col((r) => r.serverP50 / 1000),
          2,
        )}) | ` +
        `${secs(median(col((r) => r.serverP95)))} (${range(
          col((r) => r.serverP95 / 1000),
          2,
        )}) | ` +
        `${secs(median(col((r) => r.serverMax)))} | ` +
        `${secs(median(col((r) => r.clientP50)))} | ${secs(median(col((r) => r.clientP95)))} | ` +
        `${rows.reduce((sum, r) => sum + r.nonAc, 0)} | ${fixed(median(col((r) => r.cpu)), 0)} |`,
    );
  }

  console.log('');
  console.log("### Judging by language: median across runs of each run's p50 and p95, seconds");
  console.log('');
  console.log('| users | language | p50 s | p95 s |');
  console.log('|---:|---|---:|---:|');
  for (const level of USER_LEVELS) {
    for (const language of ['CPP', 'PYTHON'] as const) {
      const rows = results
        .filter((r) => r.users === level)
        .map((r) => r.byLanguage[language])
        .filter((v): v is NonNullable<typeof v> => v !== null);
      if (rows.length === 0) continue;
      console.log(
        `| ${level} | ${language} | ${secs(median(rows.map((r) => r.p50)))} | ${secs(median(rows.map((r) => r.p95)))} |`,
      );
    }
  }
  if (results.some((r) => r.nonAc > 0)) {
    console.error('\nSome reference solutions did not get AC: see the non-AC column.');
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* reads phase                                                                                 */
/* ------------------------------------------------------------------------------------------ */

interface ReadTarget {
  label: string;
  path: string;
}

interface ReadRun {
  p50: number;
  p95: number;
  max: number;
  rps: number;
  errors: number;
  cpu: number;
}

/** `total` GETs of `url` spread over `concurrency` workers; returns per-request latencies in ms. */
async function drive(
  url: string,
  concurrency: number,
  total: number,
): Promise<{ latencies: number[]; errors: number; bytes: number }> {
  const latencies: number[] = [];
  let errors = 0;
  let bytes = 0;
  let issued = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (issued < total) {
        issued += 1;
        const started = performance.now();
        const response = await fetch(url);
        bytes = (await response.arrayBuffer()).byteLength;
        latencies.push(performance.now() - started);
        if (response.status !== 200) errors += 1;
      }
    }),
  );
  return { latencies, errors, bytes };
}

async function readPhase(): Promise<void> {
  const list = await api<{ items?: { slug: string }[] }>('GET', '/problems?pageSize=1', null);
  const slug = list.json.items?.[0]?.slug;
  if (!slug) throw new Error('GET /api/problems returned no problems: is the database seeded?');
  const targets: ReadTarget[] = [
    { label: 'problem list (page size 20)', path: '/problems?page=1&pageSize=20' },
    { label: `problem detail (${slug})`, path: `/problems/${slug}` },
    {
      label: 'scoreboard page (ended contest, page size 50)',
      path: '/contests/arbiter-round-1/scoreboard?page=1&pageSize=50',
    },
    {
      label: 'scoreboard page (running contest, page size 50)',
      path: '/contests/weekly-practice-arena/scoreboard?page=1&pageSize=50',
    },
    {
      label: 'leaderboard by rating (page size 20)',
      path: '/leaderboard?by=rating&page=1&pageSize=20',
    },
    { label: 'landing stats', path: '/stats' },
  ];
  const sizes = new Map<string, number>();
  for (const target of targets) {
    const probe = await drive(`${API}/api${target.path}`, 1, 1);
    if (probe.errors > 0) throw new Error(`GET /api${target.path} did not answer 200 (seeded?)`);
    sizes.set(target.label, probe.bytes);
  }

  const results = new Map<string, ReadRun[]>();
  for (const concurrency of READ_CONCURRENCY) {
    for (const target of targets) {
      const url = `${API}/api${target.path}`;
      await drive(url, concurrency, READ_WARMUP); // connections, query plans, JIT; not counted
      const runs: ReadRun[] = [];
      for (let run = 0; run < READ_REPEAT; run += 1) {
        const cpuStart = cpuSnapshot();
        const started = performance.now();
        const { latencies, errors } = await drive(url, concurrency, READ_REQUESTS);
        const wall = (performance.now() - started) / 1000;
        runs.push({
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          max: Math.max(...latencies),
          rps: latencies.length / wall,
          errors,
          cpu: cpuBusy(cpuStart),
        });
      }
      results.set(`${concurrency}|${target.label}`, runs);
      console.error(`  concurrency ${concurrency}, ${target.label}: done`);
    }
  }

  console.log('');
  console.log(
    `### Read latency: ${READ_REQUESTS} requests per run, ${READ_REPEAT} runs per row, ` +
      `${READ_WARMUP} warm-up requests, unauthenticated GETs`,
  );
  console.log('');
  console.log(
    '| endpoint | response bytes | concurrency | p50 ms | p95 ms | max ms | req/s | errors | CPU % |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const concurrency of READ_CONCURRENCY) {
    for (const target of targets) {
      const runs = results.get(`${concurrency}|${target.label}`) as ReadRun[];
      const col = (pick: (r: ReadRun) => number) => runs.map(pick);
      console.log(
        `| ${target.label} | ${sizes.get(target.label)} | ${concurrency} | ` +
          `${fixed(median(col((r) => r.p50)))} (${range(col((r) => r.p50))}) | ` +
          `${fixed(median(col((r) => r.p95)))} (${range(col((r) => r.p95))}) | ` +
          `${fixed(median(col((r) => r.max)))} | ` +
          `${fixed(median(col((r) => r.rps)), 0)} (${range(
            col((r) => r.rps),
            0,
          )}) | ` +
          `${runs.reduce((sum, r) => sum + r.errors, 0)} | ${fixed(median(col((r) => r.cpu)), 0)} |`,
      );
    }
  }
  console.log('');
  console.log(
    "Each cell is the median over runs of that run's statistic, with the run range in brackets.",
  );
}

async function main(): Promise<void> {
  if (!['judge', 'reads', 'all'].includes(PHASE)) {
    throw new Error('--phase must be judge, reads or all');
  }
  const health = await fetch(`${API}/healthz`).catch(() => null);
  if (!health?.ok) throw new Error(`The API is not answering on ${API}/healthz`);
  console.log(`Load test against ${API}, run ${RUN_ID}, ${cpus().length} logical CPUs.`);
  if (PHASE === 'judge' || PHASE === 'all') await judgePhase();
  if (PHASE === 'reads' || PHASE === 'all') await readPhase();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
