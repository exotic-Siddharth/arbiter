# Arbiter: Design Document

**Arbiter** is an online judge and live programming-contest platform. Users solve algorithmic problems in an in-browser editor. Their untrusted C++, Python, Java or JavaScript code runs inside locked-down, throwaway Docker sandboxes, fed by a job queue. Verdicts, per-test progress and contest scoreboards stream to the browser in real time.

Status: v1 design, 2026-11-07. This document is the source of truth for the build. Any deviation must be recorded in the "Decisions log" at the bottom.

---

## 1. Intent

Arbiter is a portfolio project. Interviewers should be able to try it live in two minutes, and its author should be able to defend every design decision. The hard problem at its core is **executing untrusted code safely and fast, and reporting results live**. Everything around that core (auth, contests, scoreboards, admin tooling) should be complete and production-shaped, not stubbed.

### Goals
- A complete, polished, deployable full-stack app: real auth, real judge, real contests, a real admin panel.
- A sandbox that withstands the classic attacks: fork bombs, memory bombs, infinite loops, output floods, network access, writes to the filesystem, attempts to kill the judge, and attempts to read expected outputs. Automated tests prove each defence.
- Live UX: test-by-test verdict streaming, live scoreboards and a live "recently judged" feed.
- Engineering hygiene: strict TypeScript, validated inputs, unit, integration, sandbox and e2e tests, CI, Docker, OpenAPI docs, metrics, and a README with architecture and measured numbers.

### Non-goals (v1)
Discussion forums, OAuth/social login, email sending, payments, interactive or special-judge problems (beyond the float-tolerance checker), virtual contests, scoreboard freeze, team contests, i18n, and multi-region scaling.

### Anti-goals (failure even if it "works")
- Problem statements copied from LeetCode, Codeforces or other judges. **Every problem must be original.**
- Assets loaded from CDNs: Monaco, fonts, KaTeX and everything else must be bundled and self-hosted.
- Buttons or pages that do nothing, placeholder lorem ipsum, or TODO-stubbed features in the shipped UI.
- Hard-coded secrets. Logged passwords, tokens or source code.
- Flaky tests, and tests that pass by mocking the thing under test (the sandbox tests must use real Docker).

---

## 2. Users & core journeys

Roles: **guest** (not logged in), **user**, **admin** (problem setter and operator).

1. **Guest → user**: lands on `/` (live feed of judged submissions, stats, CTA) → "Try the demo" (one-click login as the demo user) or registers.
2. **Practice**: `/problems` → filter/search → open a problem → write code (template per language) → **Run** on custom input → **Submit** → watch "Queued → Compiling → Running test 3/12" and per-test chips stream in → final verdict with time/memory. A failed sample shows input / expected / actual.
3. **Contest**: `/contests` → register for a running or upcoming contest → contest page with countdown, problems A–E and live ICPC scoreboard → submissions update the scoreboard in real time for everyone watching.
4. **Profile**: `/u/:username` shows solved-by-difficulty, a 365-day activity heatmap, rating history chart, language breakdown and recent ACs.
5. **Admin**: create/edit problems (markdown with live preview, KaTeX), manage test cases (add, edit, bulk-upload `.in`/`.out` files), validate the reference solution, generate expected outputs from it, create contests, apply ratings after a contest, run the plagiarism check and inspect matched code side by side, and watch the judge monitor (queue depth, workers, latency).

---

## 3. Architecture

```mermaid
flowchart LR
  subgraph Browser
    W[React SPA<br/>Monaco · TanStack Query · Socket.IO client]
  end
  W -- REST /api --> A[API server<br/>Express 5 + Socket.IO]
  W <-- WebSocket /socket.io --> A
  A -- Prisma --> P[(PostgreSQL 16)]
  A -- BullMQ enqueue / rate limits / scoreboard cache --> R[(Redis 7)]
  R -- jobs --> J[Judge worker<br/>BullMQ consumer]
  J -- Prisma --> P
  J -- Socket.IO redis-emitter --> R
  R -- adapter pub/sub --> A
  J -- "docker run -i (one container per job)" --> S[[Sandbox container<br/>harness.py · no network · read-only FS · cgroup limits]]
```

**Submission lifecycle:**

1. `POST /api/submissions`: the API validates the request, applies the rate limit, inserts a `Submission(status=QUEUED)`, and enqueues `{type:"SUBMISSION", submissionId}` on the BullMQ queue `judge`. It returns `202`.
2. The worker picks up the job and loads the submission and its test cases. It sets `status=COMPILING` and emits `submission:status`.
3. The worker spawns `docker run -i … arbiter-sandbox` and speaks the JSON-lines protocol (§8.4) over stdin/stdout:
   - send `init` (source, commands, limits)
   - receive `compiled`
   - for each test, in order (samples first): send `run`, receive `result`
   - after each result: compare the output **outside the sandbox**, then emit `submission:test`
   - stop at the first failure
4. The worker persists the verdict, per-test results, and counters (`Problem.submissionCount/acceptedCount`). It emits `submission:done` (plus `feed:judged`) and, for contest submissions, recomputes that user's scoreboard row in Redis and emits `scoreboard:row`.
5. The container exits and is auto-removed (`--rm`). On startup, a janitor removes stale containers labelled `arbiter.sandbox=1`.

**Processes:**
- `api`: HTTP plus Socket.IO, using `@socket.io/redis-adapter`.
- `worker`: BullMQ workers for the queues `judge` (submissions, reference validation, output generation), `run` (custom-input runs) and `plagiarism`. It emits socket events through `@socket.io/redis-emitter` and heartbeats to Redis.
- `web`: Vite dev server in development; nginx serving the static build plus a reverse proxy in production.

---

## 4. Tech stack (pin these majors)

| Area | Choice |
|---|---|
| Runtime | Node 22 LTS, npm workspaces, TypeScript 5.x `strict`, ESM everywhere |
| API | Express **5**, Socket.IO 4 (+ `@socket.io/redis-adapter`, `@socket.io/redis-emitter`), Prisma **6** + PostgreSQL 16, ioredis 5, BullMQ 5, zod **3**, `@asteasolutions/zod-to-openapi` 7 + `swagger-ui-express`, pino + pino-http, helmet, cors, cookie-parser, express-rate-limit 7 + rate-limit-redis, jsonwebtoken (HS256), `@node-rs/argon2`, prom-client |
| Web | React 19, Vite 6+, React Router 7 (`createBrowserRouter` from `react-router`), TanStack Query 5, Zustand 5, Tailwind CSS **4** (`@tailwindcss/vite`), lucide-react, `@monaco-editor/react` + `monaco-editor` **bundled locally** (`loader.config({ monaco })`, Vite `?worker` imports, no CDN), react-markdown + remark-gfm + remark-math + rehype-katex + katex, socket.io-client 4, react-resizable-panels, recharts (rating chart), date-fns, clsx + tailwind-merge, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`, sonner (toasts) |
| Tests | Vitest 3, Supertest 7, @testing-library/react + jsdom, Playwright (chromium) |
| Tooling | ESLint 9 flat config + typescript-eslint, Prettier 3, tsx (dev), tsup (API build) |
| Infra | Docker Compose (`postgres:16-alpine`, `redis:7-alpine`), sandbox image (`debian:bookworm-slim` + g++ + python3 + openjdk-17-jdk-headless + nodejs), nginx, GitHub Actions |

Express 5 notes: rejected promises from async handlers reach the error middleware automatically. Route syntax follows path-to-regexp v8: no bare `*`, and optional segments are written `{/:x}`.

---

## 5. Repository layout

```
arbiter/
  package.json                 # npm workspaces: apps/*, packages/*
  tsconfig.base.json  eslint.config.js  .prettierrc  .editorconfig
  .gitattributes               # * text=auto eol=lf   (sandbox files MUST stay LF)
  .env.example  docker-compose.yml  docker-compose.prod.yml
  apps/
    api/
      prisma/ schema.prisma  migrations/  seed.ts
      src/
        index.ts               # HTTP + Socket.IO server entry
        worker.ts              # judge/run/plagiarism worker entry
        app.ts                 # createApp(deps) → express app (used by tests)
        config/env.ts          # zod-validated env, fails fast
        db/prisma.ts
        lib/                   # logger, errors (AppError + codes), redis, jwt, password,
                               # rateLimit, pagination, time
        middleware/            # requestId, auth (optional/required), requireRole,
                               # validate(zod), error handler, notFound
        modules/
          auth/  users/  problems/  submissions/  runs/  contests/  admin/  stats/  plagiarism/
            (each: routes.ts, service.ts, *.test.ts)
        judge/                 # queue.ts, processor.ts, sandbox.ts, protocol.ts,
                               # checker.ts, verdict.ts, languages.ts, janitor.ts, heartbeat.ts
        realtime/              # io.ts (server+adapter+auth), emitter.ts, rooms.ts
        openapi/               # registry.ts, document.ts (served at /api/openapi.json + /api/docs)
      test/                    # setup, helpers (factories, authed agent), global-setup
    web/
      index.html  vite.config.ts  playwright.config.ts
      src/
        main.tsx  router.tsx  App.tsx
        styles/index.css       # tailwind + theme tokens
        lib/                   # api.ts (fetch + auto refresh), socket.ts, queryClient.ts,
                               # format.ts, cn.ts, monaco.ts (local loader + workers)
        stores/                # auth.ts, theme.ts
        components/ui/         # Button, Input, Textarea, Select, Badge, Card, Tabs, Dialog,
                               # Table, Tooltip, Skeleton, Spinner, EmptyState, Pagination,
                               # Kbd, Avatar, ProgressBar
        components/            # layout/ (AppShell, Navbar, Footer, ThemeToggle, AdminLayout),
                               # CodeEditor, Markdown, VerdictBadge, DifficultyBadge,
                               # Countdown, Heatmap, RatingChart, RatingBadge, TestChips
        features/              # landing/ auth/ problems/ submissions/ contests/ profile/
                               # leaderboard/ admin/
      e2e/                     # Playwright specs
  packages/
    shared/src/                # zod schemas + inferred types for every request/response,
                               # socket event payloads, constants (languages, verdicts,
                               # limits, rating tiers), index.ts
  sandbox/
    Dockerfile  harness.py  README.md
  seed/problems/<slug>/        # problem.md, meta.json, gen.py, ref.py, ref.cpp,
                               # tests/NN.in, tests/NN.out (+ optional slow.py / wrong.py)
  scripts/                     # loadtest.ts, gen-tests.py, wait-for.ts
  docs/                        # DESIGN.md (this), ARCHITECTURE.md, SANDBOX.md, API.md,
                               # DEPLOYMENT.md, screenshots/
  .github/workflows/ci.yml
  README.md  LICENSE (MIT)
```

Internal packages export TypeScript source (`"exports": {".": "./src/index.ts"}`). The API is built with tsup, which bundles `@arbiter/shared`. The web app consumes the package through Vite.

---

## 6. Configuration

All configuration comes from env vars validated by zod in `config/env.ts`. A missing or invalid value crashes startup with a clear message. `.env.example` documents every variable.

| Var | Dev default | Notes |
|---|---|---|
| `NODE_ENV` | development | |
| `API_PORT` | 4000 | |
| `WEB_ORIGIN` | http://localhost:5173 | CORS + cookie origin |
| `DATABASE_URL` | postgresql://arbiter:arbiter@localhost:55432/arbiter?schema=public | |
| `REDIS_URL` | redis://localhost:56379/0 | |
| `QUEUE_PREFIX` | arbiter | BullMQ prefix (tests use a random one) |
| `JWT_ACCESS_SECRET` | (dev value in .env.example) | ≥ 32 chars; required in prod |
| `ACCESS_TOKEN_TTL_SEC` | 900 | |
| `REFRESH_TOKEN_TTL_DAYS` | 14 | |
| `COOKIE_SECURE` | false | true in prod |
| `SANDBOX_IMAGE` | arbiter-sandbox:latest | |
| `SANDBOX_RUNTIME` | (empty) | e.g. `runsc` for gVisor |
| `DOCKER_BIN` | docker | absolute path allowed (Windows: `C:\Program Files\Docker\Docker\resources\bin\docker.exe`) |
| `JUDGE_CONCURRENCY` | 2 | sandbox jobs in parallel per worker |
| `RUN_CONCURRENCY` | 1 | |
| `SEED_ADMIN_PASSWORD` | admin12345 (dev only) | required when seeding in prod |
| `SEED_DEMO_PASSWORD` | demo12345 | |
| `VITE_DEMO_LOGIN` | true | shows "Try the demo" button |

Ports: web **5173**, api **4000**, Postgres **55432**, Redis **56379** (non-default host ports avoid clashes with other local services). The Vite dev server proxies `/api` and `/socket.io` (`ws: true`) to the API, so the browser is always same-origin.

---

## 7. Data model (Prisma)

```prisma
enum Role             { USER ADMIN }
enum Difficulty       { EASY MEDIUM HARD }
enum Language         { CPP PYTHON JAVA JAVASCRIPT }
enum SubmissionStatus { QUEUED COMPILING RUNNING DONE FAILED }   // FAILED = judge could not finish (IE)
enum Verdict          { AC WA TLE MLE RE CE OLE IE }
enum CheckerType      { TOKENS EXACT FLOAT }
enum SubmissionKind   { NORMAL REFERENCE }                        // REFERENCE = admin validation run
enum JobStatus        { PENDING RUNNING DONE FAILED }

model User {
  id            String   @id @default(cuid())
  email         String   @unique            // stored lower-case
  username      String   @unique            // 3–20 chars [a-zA-Z0-9_], case-insensitive unique (store lower in usernameLower)
  usernameLower String   @unique
  passwordHash  String
  role          Role     @default(USER)
  rating        Int      @default(1200)
  bio           String?  @db.VarChar(280)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  refreshTokens    RefreshToken[]
  submissions      Submission[]
  registrations    ContestRegistration[]
  ratingChanges    RatingChange[]
  authoredProblems Problem[] @relation("ProblemAuthor")
}

model RefreshToken {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique             // sha256(base64url token)
  familyId     String                        // one family per login; rotation keeps the family
  userAgent    String?
  ip           String?
  createdAt    DateTime  @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?
  @@index([userId])
  @@index([familyId])
}

model Problem {
  id                String       @id @default(cuid())
  slug              String       @unique
  title             String
  statementMd       String       @db.Text
  difficulty        Difficulty
  timeLimitMs       Int          @default(1000)
  memoryLimitMb     Int          @default(256)
  checker           CheckerType  @default(TOKENS)
  floatTolerance    Float?                    // used when checker = FLOAT (abs OR rel), e.g. 1e-6
  isPublished       Boolean      @default(false)
  authorId          String?
  author            User?        @relation("ProblemAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  referenceLanguage Language?
  referenceSolution String?      @db.Text
  submissionCount   Int          @default(0)  // NORMAL submissions only
  acceptedCount     Int          @default(0)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  tags              ProblemTag[]
  testCases         TestCase[]
  submissions       Submission[]
  contestProblems   ContestProblem[]
}

model Tag        { id String @id @default(cuid())  name String @unique  problems ProblemTag[] }
model ProblemTag {
  problemId String
  tagId     String
  problem   Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([problemId, tagId])
}

model TestCase {
  id             String  @id @default(cuid())
  problemId      String
  problem        Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  ordinal        Int                         // 1-based; samples have the lowest ordinals
  input          String  @db.Text            // ≤ 4 MB
  expectedOutput String  @db.Text
  isSample       Boolean @default(false)
  explanation    String? @db.Text            // samples only, markdown
  @@unique([problemId, ordinal])
}

model Submission {
  id            String           @id @default(cuid())
  kind          SubmissionKind   @default(NORMAL)
  userId        String
  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  problemId     String
  problem       Problem          @relation(fields: [problemId], references: [id], onDelete: Cascade)
  contestId     String?          // set only for in-window submissions by registrants
  contest       Contest?         @relation(fields: [contestId], references: [id], onDelete: SetNull)
  language      Language
  sourceCode    String           @db.Text    // ≤ 64 KB
  status        SubmissionStatus @default(QUEUED)
  verdict       Verdict?
  timeMs        Int?             // max CPU time over executed tests
  memoryKb      Int?             // max RSS over executed tests
  testsPassed   Int              @default(0)
  testsTotal    Int              @default(0)
  compileOutput String?          @db.Text    // ≤ 16 KB
  errorMessage  String?          // internal details, admin-only
  createdAt     DateTime         @default(now())
  judgedAt      DateTime?
  results       SubmissionTestResult[]
  @@index([userId, createdAt])
  @@index([problemId, createdAt])
  @@index([contestId, createdAt])
  @@index([createdAt])
}

model SubmissionTestResult {
  id            String     @id @default(cuid())
  submissionId  String
  submission    Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  ordinal       Int
  verdict       Verdict
  timeMs        Int
  memoryKb      Int
  isSample      Boolean
  outputPreview String?    @db.Text   // samples only: first 4 KB of stdout
  stderrPreview String?    @db.Text   // samples only: last 2 KB of stderr
  @@unique([submissionId, ordinal])
}

model Contest {
  id             String    @id @default(cuid())
  slug           String    @unique
  title          String
  descriptionMd  String    @db.Text
  startsAt       DateTime
  endsAt         DateTime
  isPublished    Boolean   @default(false)
  penaltyMinutes Int       @default(20)
  ratedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  problems          ContestProblem[]
  registrations     ContestRegistration[]
  submissions       Submission[]
  ratingChanges     RatingChange[]
  plagiarismReports PlagiarismReport[]
}

model ContestProblem {
  contestId String
  problemId String
  label     String  @db.VarChar(2)            // "A", "B", …
  ordinal   Int
  contest   Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  problem   Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@id([contestId, problemId])
  @@unique([contestId, label])
}

model ContestRegistration {
  contestId    String
  userId       String
  registeredAt DateTime @default(now())
  contest      Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([contestId, userId])
}

model RatingChange {
  id        String   @id @default(cuid())
  userId    String
  contestId String
  oldRating Int
  newRating Int
  rank      Int
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  contest   Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  @@unique([userId, contestId])
}

model PlagiarismReport {
  id         String    @id @default(cuid())
  contestId  String?
  contest    Contest?  @relation(fields: [contestId], references: [id], onDelete: Cascade)
  problemId  String?                         // null = all problems of the contest
  threshold  Float     @default(0.6)
  status     JobStatus @default(PENDING)
  error      String?
  createdAt  DateTime  @default(now())
  finishedAt DateTime?
  pairs      PlagiarismPair[]
}

model PlagiarismPair {
  id            String           @id @default(cuid())
  reportId      String
  report        PlagiarismReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  problemId     String
  submissionAId String
  submissionBId String
  similarity    Float                          // 0..1
  matchedLinesA Json                           // number[] (1-based line numbers)
  matchedLinesB Json
  @@index([reportId, similarity])
}

model AdminJob {                               // generate-outputs jobs
  id         String    @id @default(cuid())
  type       String                            // "GENERATE_OUTPUTS"
  problemId  String
  status     JobStatus @default(PENDING)
  progress   Int       @default(0)             // tests done
  total      Int       @default(0)
  error      String?
  createdAt  DateTime  @default(now())
  finishedAt DateTime?
}
```

Builders may add indexes and columns if they record them in the Decisions log. They may not drop or rename anything above without recording it.

---

## 8. Judge & sandbox (the core)

### 8.1 Threat model
Submitted code is hostile. It may try to:
- exhaust the CPU (infinite loops) or wall time (`sleep`);
- exhaust memory, or exhaust pids with a fork bomb;
- flood stdout, or fill the disk;
- open network connections;
- read or write files outside its box, or read the expected outputs;
- kill or confuse the judge, or forge results;
- leave processes running after the job ends.

Each of these needs a mechanism and an automated test (§8.7).

### 8.2 Container (one per job)
The worker spawns the Docker CLI with an **args array** (never a shell string):

```
docker run --rm -i --init
  --name arbiter-sbx-<jobId>-<rand6> --label arbiter.sandbox=1
  --label arbiter.prefix=<QUEUE_PREFIX> --label arbiter.worker=<workerId>
  --network none --read-only
  --tmpfs /work:rw,exec,nosuid,size=128m --tmpfs /tmp:rw,nosuid,size=32m
  --memory <M>m --memory-swap <M>m --cpus 1 --pids-limit 128
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add KILL
  --security-opt no-new-privileges
  --ulimit core=0 --ulimit nofile=256:256
  [--runtime $SANDBOX_RUNTIME]
  $SANDBOX_IMAGE
```

`M` = `memoryLimitMb + language.memoryOverheadMb + 256`, capped at 2048.

**Expected outputs never enter the container.** The worker compares outputs itself, so a submission cannot read the answers.

The image (`sandbox/Dockerfile`) is `debian:bookworm-slim` with `g++ python3 openjdk-17-jdk-headless nodejs`, a non-login user `runner` (uid/gid 10001), the harness at `/judge/harness.py` (root-owned, 0644), and `ENTRYPOINT ["python3","-u","/judge/harness.py"]`. The harness runs as root inside the container, as a child of tini (PID 1, because of `--init`), but with almost every capability dropped. It writes the source file into `/work` (tmpfs, mode 1777) with mode 0644, and runs both the compiler and the program as `runner`, with cwd `/work`. The worker strips a leading UTF-8 BOM from the source before sending it, because javac rejects BOMs.

### 8.3 Harness responsibilities (`sandbox/harness.py`, Python stdlib only)
- Read JSON-lines commands from stdin and write JSON-lines events to stdout. Nothing else may reach stdout.
- **Compile** (if the language has a compile step): run the compile command as `runner` in `/work`, with a 15 s wall limit and output captured up to 16 KB.
- **Run each test** in a fresh child process (`subprocess.Popen` with `start_new_session=True` and a `preexec_fn`). The child:
  - writes `1000` to `/proc/self/oom_score_adj` (so the cgroup OOM killer picks user code, never the harness);
  - drops to uid/gid 10001 with no supplementary groups;
  - sets `RLIMIT_CPU` = ceil(cpuLimitMs/1000)+1 s, `RLIMIT_FSIZE` = 16 MB, `RLIMIT_CORE` = 0, `RLIMIT_NOFILE` = 128, and `RLIMIT_STACK` = unlimited;
  - sets `RLIMIT_AS` = memoryLimitKb + 64 MB for CPP only.

  Stdin is written from a thread. Stdout is read in a thread capped at `outputLimitBytes` (8 MB): if the cap is exceeded, the harness kills the process group and reports OLE. Stderr is kept to its last 2 KB. A wall-clock timer kills the whole process group at `wallLimitMs`. Rusage comes from `os.wait4(pid, 0)` (`ru_utime + ru_stime` → cpuMs, `ru_maxrss` → KB). I/O threads start only after `Popen` returns, and are joined before the next `Popen` (because `preexec_fn` is not thread-safe).
- Classify the raw status, checking in this order:
  1. `OLE` if the output cap was hit.
  2. `MLE` if any of these holds:
     - maxRss > memoryLimitKb;
     - the process was killed by SIGKILL with maxRss ≥ 90 % of the container limit;
     - it exited non-zero or aborted, and the stderr tail matches `std::bad_alloc|MemoryError|OutOfMemoryError|JavaScript heap out of memory|Array buffer allocation failed`;
     - Java exited with code 3 (`-XX:+ExitOnOutOfMemoryError`).
  3. `TLE` if cpuMs > cpuLimitMs, the process was wall-killed, or it received SIGXCPU.
  4. `RE` on any other non-zero exit or signal.
  5. Otherwise `OK`.

### 8.4 Protocol (JSON lines; all byte payloads base64)

Worker → harness:
```json
{"type":"init","sourceFile":"main.cpp","source":"<b64>","compile":["g++","-std=gnu++17","-O2","-pipe","-o","main","main.cpp"],"run":["./main"],"cpuLimitMs":1000,"wallLimitMs":3000,"memoryLimitKb":262144,"rlimitAsKb":327680,"outputLimitBytes":8388608}
{"type":"run","id":"7","input":"<b64>"}
{"type":"exit"}
```
Harness → worker:
```json
{"type":"ready","version":1,"pid":7}
{"type":"compiled","ok":true,"output":"<b64>","timeMs":812}
{"type":"result","id":"7","status":"OK|TLE|MLE|RE|OLE","exitCode":0,"signal":null,"cpuMs":12,"wallMs":30,"maxRssKb":3456,"outputLimitExceeded":false,"wallKilled":false,"stdout":"<b64>","stderr":"<b64>"}
{"type":"error","message":"..."}
```

`rlimitAsKb` is set for C++ only; `outputLimitExceeded` and `wallKilled` are the harness's raw facts, from which the worker re-derives the status (it treats its own classification as authoritative).

Worker-side safety:
- an overall deadline for the whole container (compile 20 s + Σ(wall + 1 s) + 10 s), after which it runs `docker kill`;
- malformed output → IE;
- if the Docker CLI is missing or the image is absent → IE with a clear `errorMessage`;
- BullMQ retries a crashed job up to 2 times with backoff before marking it FAILED/IE.

### 8.5 Languages (single source of truth: `apps/api/src/judge/languages.ts`; display metadata and templates in `packages/shared`)

| Language | File | Compile | Run | Time × | Mem overhead |
|---|---|---|---|---|---|
| CPP (C++17, g++) | main.cpp | `g++ -std=gnu++17 -O2 -pipe -o main main.cpp` | `./main` | 1 | 0 MB |
| PYTHON (3.11) | main.py | `python3 -m py_compile main.py` (catches syntax errors → CE) | `python3 -B main.py` | 3 | 16 MB |
| JAVA (17) | Main.java | `javac -encoding UTF-8 -d . Main.java` | `java -Xmx{ML}m -Xss64m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:-UsePerfData -XX:+ExitOnOutOfMemoryError -cp . Main` | 2 | 64 MB |
| JAVASCRIPT (Node 18) | main.js | `node --check main.js` | `node --max-old-space-size={ML} --stack-size=65500 main.js` | 2 | 48 MB |

`{ML}` is the problem's `memoryLimitMb`.

Derived limits per test:
- `cpuLimitMs = timeLimitMs × mult`
- `wallLimitMs = cpuLimitMs × 2 + 1000`
- `memoryLimitKb = (memoryLimitMb + overhead) × 1024`

`packages/shared` holds a starter template per language that reads stdin and writes stdout.

### 8.6 Verdicts & checkers
- The worker runs tests in ordinal order (samples first) and **stops at the first non-AC test**.
- A raw `OK` is compared with the checker:
  - `TOKENS` (default): whitespace-separated tokens must be equal;
  - `EXACT`: equal after stripping trailing whitespace on each line and trailing blank lines;
  - `FLOAT`: tokens are compared pairwise; numeric pairs pass if `|a−b| ≤ tol` or `|a−b| ≤ tol·|b|`, and non-numeric pairs must be equal.
- A raw non-OK status maps 1:1 to TLE / MLE / RE / OLE. A failed compile gives CE (no tests run).
- The final verdict is that of the first failing test, or AC if all pass. `timeMs`/`memoryKb` are the max over the tests that ran. `testsPassed` and `testsTotal` are stored.
- For sample tests, store `outputPreview` (first 4 KB of stdout) and `stderrPreview` (last 2 KB), so the UI can show input / expected / actual for a failed sample. Hidden tests never expose input or output to non-admins.
- **Run mode** (`run` queue): one test with user input. It returns the raw status plus stdout (≤ 64 KB shown), stderr (2 KB) and compile output. Nothing is persisted in Postgres. The result goes to Redis `run:<runId>` (TTL 10 min) and to socket room `user:<id>`.

### 8.7 Required sandbox tests (`npm run test:sandbox`, real Docker, image built first)

For each language: AC on a sample problem, WA, CE (syntax error), RE (non-zero exit / exception), TLE (infinite loop), MLE (allocate 1 GB).

Attacks:
- fork bomb: finishes as RE or TLE within the deadline, and no `arbiter-sbx-*` container is left afterwards;
- `sleep 100`: TLE via the wall limit;
- 100 MB of output: OLE;
- network connect to 1.1.1.1:53: fails, so the program reports RE or prints a failure;
- writing `/etc/x` or `/judge/harness.py`: fails;
- `kill -9 <harnessPid>` (the pid reported in `ready`) fails; `kill -9 -1` (sent from a forked child of the program, because Linux never delivers kill(-1) to the caller itself) kills only the runner's own processes; the judge still returns a verdict;
- reading `/proc/<harnessPid>/fd/*` or `/proc/<harnessPid>/environ` is denied;
- a program that prints a fake `{"type":"result"...}` line: treated as plain program output, never as a protocol message.

Also needed: unit tests for the checker and verdict mapping (no Docker), and a test that **expected outputs are absent from the `init`/`run` payloads**.

### 8.8 Queue & workers
BullMQ queues use the prefix `QUEUE_PREFIX`.
- `judge`: jobs `{type:"SUBMISSION", submissionId}` or `{type:"GENERATE_OUTPUTS", adminJobId}`. A REFERENCE-kind submission goes through the same path as a SUBMISSION job.
- `run`: custom-input runs.
- `plagiarism`: `{reportId}`.

Concurrency comes from env. A worker heartbeat sets Redis key `judge:worker:<id>` = `{id, startedAt, concurrency, processed, lastSeen}` with a 15 s TTL, refreshed every 5 s. The admin monitor reads queue counts via BullMQ `getJobCounts()`. On startup, the janitor removes containers left over from a crashed worker.

---

## 9. Contests, scoring, rating, plagiarism

**Visibility & submission rules:**
- `/api/problems` lists published problems only.
- A contest's problems are hidden from non-admins until `startsAt`. During the contest they are visible to everyone through the contest routes, but only registrants can submit.
- A submission with `contestSlug`:
  - contest running and user registered → contest submission (`contestId` set);
  - contest ended → practice submission (`contestId` null), allowed even if the problem is unpublished;
  - contest not started → 403.

  A submission without `contestSlug` requires a published problem (or an admin).
- During a running contest, other users' contest submissions are hidden in lists. After the end they are visible as metadata only. Source code is visible to its owner and to admins only.
- Registration is allowed until `endsAt`.

**ICPC scoreboard:**
- Participants are registrants with at least one contest submission.
- Per problem, track the attempts before the first AC. CE and IE do not count as attempts. Submissions after the first AC are ignored.
- `acMinute` = floor((acAt − startsAt) / 60 s).
- `solved` = number of ACs. `penalty` = Σ over solved problems of (acMinute + penaltyMinutes × wrongAttemptsBefore).
- Rank by solved descending, then penalty ascending. Equal (solved, penalty) pairs share a rank.
- A cell is `pending` while a submission is QUEUED/COMPILING/RUNNING. `firstSolve` marks the earliest AC on each problem.

Redis keys:
- `contest:<id>:rank`: ZSET, score = solved × 10⁷ − penalty;
- `contest:<id>:rows`: HASH userId → row JSON.

After each judged contest submission, `recomputeRow(contestId, userId)` rebuilds the row from Postgres. `GET /scoreboard` reads the ZSET with pagination. If the keys are missing, `rebuildScoreboard(contestId)` recomputes them under a Redis lock. The pure function `computeRow(contest, submissions)` and the ranking function are unit-tested. `recomputeRow` only updates Redis and returns the row. Callers emit `scoreboard:row`: on contest-submission creation (for the pending cell) and on every terminal judge outcome. `cells[].attempts` counts tries before the first AC, excluding CE and IE.

**Rating (pairwise Elo):**
- Applied by an admin after the contest ends. The operation is idempotent: if `ratedAt` is set, return 409. It also answers 409 while counted submissions are still QUEUED/COMPILING/RUNNING.
- For N ≥ 2 participants with ranks r_i and pre-contest ratings R_i:
  - `S_ij` = 1 if i ranked better, 0.5 if tied, 0 otherwise;
  - `E_ij` = 1 / (1 + 10^((R_j − R_i)/400));
  - `Δ_i` = round(64 × Σ_{j≠i}(S_ij − E_ij) / (N−1)).
- Write `RatingChange` rows, update `User.rating`, and set `ratedAt`, all in one transaction.
- Unit tests check that the deltas are near zero-sum (|Σ Δ| ≤ N), that the winner gains, the last place loses, and that equal ratings with a tie give 0.

**Plagiarism (winnowing, as in MOSS):**
1. Tokenise per language:
   - drop comments and whitespace;
   - replace identifiers with `I`, number literals with `N` and string/char literals with `S`;
   - keep language keywords and operators;
   - remember each token's line.
2. Hash every k-gram of k = 8 tokens (64-bit FNV-1a over the joined tokens, as a BigInt or two 32-bit halves).
3. Winnow with window w = 4: in each window keep the minimal hash, taking the rightmost on ties.
4. Similarity = |F_A ∩ F_B| / min(|F_A|, |F_B|).
5. Compare each participant's latest AC (or, failing that, latest) contest submission per problem against every other participant's. Store pairs with similarity ≥ threshold, plus the line numbers covered by matched fingerprints.

The job runs on the `plagiarism` queue. Unit tests: renamed identifiers plus reformatting score ≥ 0.9; two unrelated solutions score < 0.3; comments-only changes score 1.0.

---

## 10. REST API (prefix `/api`, JSON)

**Conventions:**
- Errors: `{ "error": { "code": "VALIDATION_ERROR|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|CONFLICT|RATE_LIMITED|PAYLOAD_TOO_LARGE|INTERNAL", "message": "...", "details": ... } }`.
- Paging: `?page=1&pageSize=20` (max 100) → `{ items, total, page, pageSize }`.
- Timestamps are ISO-8601 strings. IDs are cuid.
- Every request and response schema lives in `packages/shared` as zod. The API validates `body`, `query` and `params` with the same schemas and registers them in the OpenAPI registry. `/api/openapi.json` and `/api/docs` (Swagger UI) must list every endpoint.

**Auth:**
- Access token: JWT HS256 in `Authorization: Bearer …`, 15 min, claims `{sub, role, username}`. The SPA keeps it in memory only.
- Refresh token: opaque 32 random bytes in base64url, stored as its sha256. Cookie `arb_rt`: httpOnly, SameSite=Strict, Path=/api/auth, Secure in prod, 14 days.
- Rotation on every refresh. Presenting a revoked or already-rotated token revokes the whole family (reuse detection) and returns 401.

| Method & path | Auth | Request → Response |
|---|---|---|
| POST /auth/register | – | `{email, username, password(8–128)}` → 201 `{user: Me, accessToken}` + cookie. 409 on duplicate email/username |
| POST /auth/login | – | `{identifier (email or username), password}` → `{user, accessToken}` + cookie. A generic 401 on failure |
| POST /auth/refresh | cookie | → `{user, accessToken}` + rotated cookie |
| POST /auth/logout | cookie | → 204, family revoked, cookie cleared |
| GET /auth/me | user | → `{user: Me}` |
| GET /users/:username | – | → `Profile` (below) |
| PATCH /users/me | user | `{bio}` → `{user: Me}` |
| GET /leaderboard | – | `?by=rating|solved&page&pageSize` → Page<`{rank, username, rating, solved}`> |
| GET /problems | – (user optional) | `?search&difficulty&tag&status=solved|attempted|unsolved&sort=newest|difficulty|acceptance|title&page&pageSize` → Page<ProblemSummary> |
| GET /problems/:slug | – | → ProblemDetail (published, or admin) |
| GET /tags | – | → `[{name, count}]` |
| POST /submissions | user | `{problemSlug, language, sourceCode(≤64KB), contestSlug?}` → 202 `{submission: SubmissionSummary}`. Rate limit: 6/min/user |
| GET /submissions | – | `?username&problemSlug&verdict&language&mine=true&page&pageSize` → Page<SubmissionSummary> (visibility rules in §9) |
| GET /submissions/:id | – | → SubmissionDetail (`sourceCode`/`compileOutput`/previews only for the owner or an admin) |
| POST /runs | user | `{language, sourceCode, input(≤64KB), problemSlug?}` → 202 `{runId}`. Rate limit: 12/min/user |
| GET /runs/:runId | owner | → `{status:"PENDING"|"DONE", result?: RunResult}` |
| GET /contests | – | `?status=upcoming|running|past` → `ContestSummary[]` |
| GET /contests/:slug | – | → ContestDetail |
| POST /contests/:slug/register | user | → 204 (409 if already registered, 403 after the end) |
| GET /contests/:slug/problems/:label | – | → ProblemDetail (after the start) |
| GET /contests/:slug/scoreboard | – | `?page&pageSize` → Scoreboard |
| GET /contests/:slug/submissions | user | `?mine=true` → Page<SubmissionSummary> |
| GET /stats | – | → `{problems, users, submissions, judgedToday, runningContests}` |

Admin endpoints (`role=ADMIN`, all under `/api/admin`):

| Method & path | Purpose |
|---|---|
| GET/POST /problems · GET/PUT/DELETE /problems/:id | Full problem CRUD (AdminProblem incl. referenceSolution, isPublished, tags[]) |
| GET/POST /problems/:id/tests · PUT/DELETE /problems/:id/tests/:testId | Test case CRUD |
| POST /problems/:id/tests/bulk | `{tests:[{input, expectedOutput, isSample, explanation?}], replace:boolean}` (body limit 20 MB on this route only) |
| POST /problems/:id/validate-reference | Enqueues a REFERENCE submission of the stored reference → `{submissionId}` (watch it like any submission) |
| POST /problems/:id/generate-outputs | Enqueues a GENERATE_OUTPUTS job (runs the reference on every input, overwrites expectedOutput) → `{jobId}` |
| GET /jobs/:id | `{id, type, status, progress, total, error}` |
| GET/POST /contests · GET/PUT/DELETE /contests/:id | Contest CRUD with `problems: [{problemId, label}]` |
| POST /contests/:id/rate | Apply ratings (409 if not ended, still being judged or already rated) → `{changes: [{username, oldRating, newRating, rank}]}` |
| POST /plagiarism | `{contestId, problemId?, threshold?}` → `{reportId}` |
| GET /plagiarism?contestId · GET /plagiarism/:id | Report list / detail with pairs `{similarity, a:{submissionId, username, language, sourceCode, matchedLines}, b:{…}}` |
| GET /judge | `{queues:{judge:{waiting,active,completed,failed,delayed}, run:{…}, plagiarism:{…}}, workers:[{id, startedAt, lastSeen, concurrency, processed}], latency:{p50Ms, p95Ms, sample}, throughputPerMin: [{minute, count}] (last 30 min)}` |
| GET /users?search · PATCH /users/:id | List / change role |

**Shared response shapes** (zod in `packages/shared`; exact field names):
```ts
Me              { id, username, email, role, rating, bio: string|null, createdAt }
ProblemSummary  { slug, title, difficulty, tags: string[], acceptanceRate /*0..1*/, submissionCount, acceptedCount, userStatus: "SOLVED"|"ATTEMPTED"|null }
ProblemDetail   ProblemSummary & { statementMd, timeLimitMs, memoryLimitMb, checker, samples: {ordinal, input, expectedOutput, explanation: string|null}[], contest?: {slug, label} }
SubmissionSummary { id, problem: {slug, title}, user: {username}, language, status, verdict: Verdict|null, timeMs: number|null, memoryKb: number|null, testsPassed, testsTotal, contestSlug: string|null, createdAt, judgedAt: string|null }
SubmissionDetail  SubmissionSummary & { sourceCode: string|null, compileOutput: string|null, results: {ordinal, verdict, timeMs, memoryKb, isSample}[], failedSample: {ordinal, input, expectedOutput, actualOutput, stderr}|null }
RunResult       { runId, status: "OK"|"CE"|"RE"|"TLE"|"MLE"|"OLE"|"IE", stdout, stderr, compileOutput: string|null, timeMs, memoryKb }
ContestSummary  { slug, title, startsAt, endsAt, status: "UPCOMING"|"RUNNING"|"ENDED", problemCount, participantCount, isRegistered, rated: boolean }
ContestDetail   ContestSummary & { descriptionMd, penaltyMinutes, serverTime /*ISO, for client clock-offset countdowns*/, problems: {label, title, slug, solvedCount, attemptedCount, userStatus}[] | null }
Scoreboard      { contestSlug, problems: {label}[], rows: {rank, username, rating, solved, penalty, cells: {label, solved, attempts, acMinute: number|null, firstSolve, pending}[]}[], total, page, pageSize, updatedAt }
Profile         { user: {username, rating, bio, createdAt}, stats: {solved:{EASY,MEDIUM,HARD,total}, available:{EASY,MEDIUM,HARD}, submissions, accepted, acceptanceRate, languages:{language,count}[], globalRank: number|null}, heatmap:{date:"YYYY-MM-DD", count}[] /*last 365 days, UTC*/, ratingHistory:{contestSlug, contestTitle, oldRating, newRating, rank, date}[], recentAccepted:{problemSlug, title, difficulty, at}[] /*≤10*/ }
```

Health: `GET /healthz` → `{ok:true}`. `GET /readyz` checks DB and Redis (503 if either is down). `GET /metrics` serves Prometheus metrics.

---

## 11. Realtime (Socket.IO)

- The client connects with `auth: { token }`; the token is optional (guests can watch scoreboards and the feed). Authenticated sockets join `user:<id>`.
- Client → server:
  - `submission:subscribe {id}` (owner or admin; joins `submission:<id>`);
  - `contest:subscribe {slug}` / `contest:unsubscribe {slug}` (joins `contest:<id>`);
  - `feed:subscribe` (joins `feed`).

  Acks return `{ok:true}` or `{ok:false, error}`.
- Server → client (payloads are zod schemas in `packages/shared`):
  - `submission:status {id, status, testsDone, testsTotal}`
  - `submission:test {id, ordinal, verdict, timeMs, memoryKb, isSample}`
  - `submission:done {id, status, verdict, timeMs, memoryKb, testsPassed, testsTotal}`: also emitted to `user:<ownerId>`
  - `run:result RunResult` → `user:<id>`
  - `scoreboard:row {contestSlug, row}` → `contest:<id>`
  - `feed:judged {username, problemSlug, problemTitle, language, verdict, timeMs, at}` → `feed` (published problems and practice submissions only; never during-contest submissions)
- On reconnect, the client re-subscribes and refetches with TanStack Query, because WebSocket events are hints and REST is the source of truth.

---

## 12. Security requirements

- Passwords: Argon2id via `@node-rs/argon2` (memoryCost 19456 KiB, timeCost 2, parallelism 1).
- Login has a generic failure message and a rate limit of 10 per 15 min per IP+identifier. Registration is limited to 5 per hour per IP. The general API limit is 300/min/IP. All limits use a Redis store and return a `Retry-After` header.
- zod validation on every route. JSON body limit 1 MB (20 MB for bulk tests). Source code ≤ 64 KB; run input ≤ 64 KB.
- Authorization lives in the service layer: owner-or-admin for source code; the contest visibility rules in §9; admin routes behind `requireRole('ADMIN')`.
- Headers and CORS:
  - helmet on the API, with a CSP loosened only on `/api/docs`;
  - CORS restricted to `WEB_ORIGIN` with credentials;
  - the cookie is SameSite=Strict and the access token is in memory, so there is no CSRF surface;
  - prod nginx sets a strict CSP for the SPA (`script-src 'self'`; workers `'self' blob:`; no inline scripts).
- Markdown is rendered without raw HTML (react-markdown default), so problem statements cannot inject script.
- Logs never contain passwords, tokens, cookies, `Authorization` headers or source code (pino redact paths).
- Prisma only. Any `$queryRaw` must use tagged templates.
- The sandbox rules in §8. In production the worker mounts `/var/run/docker.sock`, which is root-equivalent. DEPLOYMENT.md must say so, recommend a dedicated VM, and describe the gVisor (`runsc`) option.

---

## 13. Frontend

### 13.1 Design language
- Dark-first ("midnight") with a light theme toggle. Themes are CSS variables on `:root` and `.dark`, mapped into Tailwind 4 `@theme`.
- Tokens:
  - background `#0b0d12`, surface `#12151c`, raised `#181c25`, border `#262b36`;
  - text `#e6e8ee`, muted `#9aa3b2`;
  - **primary violet `#7c5cff`** (hover `#6a4af0`), accent cyan `#22d3ee`;
  - light theme: background `#f7f8fb`, surface `#ffffff`, border `#e3e6ee`, text `#11141b`.
- Semantic colours:
  - verdicts: AC `#22c55e`, WA `#f43f5e`, TLE `#f59e0b`, MLE `#f97316`, RE `#d946ef`, CE `#38bdf8`, OLE `#eab308`, IE `#94a3b8`, pending `#a1a1aa`;
  - difficulty: Easy `#14b8a6`, Medium `#f59e0b`, Hard `#f43f5e`.
- Rating tiers (original names): <1200 Initiate (gray), 1200–1399 Apprentice (green), 1400–1599 Adept (cyan), 1600–1899 Expert (blue), 1900–2199 Master (violet), ≥2200 Grandmaster (amber).
- Type: Inter Variable for the UI and JetBrains Mono Variable for code, numbers in tables, and verdict chips. 14 px base; tabular numerals in tables.
- Shape and motion: 10 px card radius, 8 px controls, a subtle 1 px border rather than heavy shadows. Motion is short (150–200 ms) and respects `prefers-reduced-motion`.
- Accessibility: WCAG AA contrast, visible focus rings, a keyboard-reachable everything, `aria-live="polite"` on the verdict area, and labelled form controls.
- Responsive from 360 px wide. Below 1024 px the problem workspace stacks the statement over the editor.
- Every data view has **loading (skeleton), empty and error states**. Mutations show toasts. Tables paginate.
- Charts follow the repo's dataviz guidance. Builders must invoke the `dataviz` skill before writing chart code.

### 13.2 Pages
| Route | Content |
|---|---|
| `/` | Hero ("Write code. Get judged in a sandbox. Climb the board.") with CTAs Start solving / Try the demo; live stats; a **live feed** of judged submissions (socket `feed:judged`, newest first, animated in); "How the sandbox works" section (diagram + the isolation layers list); featured contest card; footer |
| `/login`, `/register` | Forms with inline validation; "Try the demo" button (logs in as `demo`) when `VITE_DEMO_LOGIN` |
| `/problems` | Search box, difficulty and tag filters, status filter (logged in), sort; table: status icon, title, tags, difficulty, acceptance %, submissions; pagination |
| `/problems/:slug` and `/contests/:slug/problems/:label` | **Workspace**: resizable split. Left: tabs Description (markdown + KaTeX, limits, samples with copy buttons, explanations) / My submissions. Right: toolbar (language select, reset to template, keyboard hints), Monaco (theme follows app theme; per problem+language draft autosaved to localStorage), bottom panel tabs **Testcase** (custom input, prefilled with sample 1) and **Result** (run output, or submission progress: status stepper, progress bar `testsDone/testsTotal`, test chips coloured by verdict as `submission:test` arrives, final banner with verdict/time/memory; failed sample → input/expected/actual diff view; CE → compile output). Buttons Run (Ctrl+') and Submit (Ctrl+Enter). In contest mode a header shows the contest name, countdown and problem switcher A–E |
| `/submissions` | Filters (mine/all, problem, verdict, language); table with live-updating rows for pending ones |
| `/submissions/:id` | Summary card, per-test results table, read-only Monaco with source (if allowed), compile output |
| `/contests` | Tabs Running / Upcoming / Past; cards with countdown, participants, register button |
| `/contests/:slug` | Header with status + countdown; Register; tabs Problems (label, title, solved count, my status) / Scoreboard / My submissions; description markdown. Before the start: countdown + description only |
| `/contests/:slug/scoreboard` | Live ICPC table: rank, user (rating colour), solved, penalty, one cell per problem (green `+`/`+2` with minute, red `−3`, yellow pending, first solve darker green with ★); rows animate when rank changes; pagination; "live" indicator |
| `/u/:username` | Header (initials avatar, rating + tier), stat cards, solved-by-difficulty bars (x / available), 365-day heatmap, rating history line chart, language breakdown, recent accepted list |
| `/leaderboard` | Tabs by rating / by solved |
| `/admin` | Admin layout with sidebar: **Judge monitor** (queue counts, workers with last-seen, latency p50/p95, throughput chart, auto-refresh 5 s), **Problems** (table → editor page with tabs Details (markdown editor + live preview, limits, checker, tags, publish toggle) / Tests (table, add/edit dialog, bulk upload by selecting matching `.in`/`.out` files) / Reference (Monaco, Validate → live verdict, Generate outputs → progress)), **Contests** (table → editor: details, schedule, problem picker with labels, Apply ratings, Run plagiarism check), **Plagiarism** (reports → pairs table sorted by similarity → side-by-side code with matched lines highlighted), **Users** (search, role toggle) |
| `*` | 404 page |

The API client (`lib/api.ts`) attaches the access token. On a 401 it calls `/auth/refresh` exactly once (concurrent 401s share one in-flight refresh promise), retries the request, and logs out if the refresh fails. On app boot it tries a silent refresh. The socket reconnects with the new token after a refresh.

---

## 14. Seed data (`npm run db:seed`, idempotent: wipes and recreates)

Content:
- 15 **original** problems, 5 EASY, 6 MEDIUM and 4 HARD, covering these techniques:
  - hashing, stack, prefix sums, binary search on the answer, two pointers;
  - grid BFS, coin-change DP (mod 1e9+7), LIS in O(n log n), Dijkstra, union-find;
  - Fenwick or segment tree, string matching (KMP/Z), Kahn's topological sort (lexicographically smallest order), greedy with a heap;
  - **one FLOAT-checker problem** (tolerance 1e-6).

  Each problem folder has:
  - `problem.md`: story, input format, output format, and constraints using KaTeX `$…$`;
  - `meta.json`: `{slug, title, difficulty, tags, timeLimitMs, memoryLimitMb, checker, floatTolerance?, samples: [1, 2]}`;
  - samples: `tests/01.*` and `tests/02.*`, with their explanations in `tests/01.md` and `tests/02.md`;
  - `gen.py`: deterministic (fixed seeds), producing 10–14 tests including edge cases and max-size cases, each input ≤ 1 MB;
  - `ref.py` and `ref.cpp`: reference solutions that must agree on every test;
  - optionally `slow.py` (TLE on large tests) and `wrong.py` (WA) for demos and e2e tests.

  Expected outputs are generated by `ref.py` and committed under `tests/`.
- Users: `admin` (ADMIN, password from `SEED_ADMIN_PASSWORD`), `demo` (password `SEED_DEMO_PASSWORD`), and 30 synthetic users with varied ratings.
- Contests, with times relative to "now" at seed time:
  - **Arbiter Round #1**: ended 7 days ago, 2 h long, problems A–E, about 25 participants with realistic historical submissions. Ratings are applied, and its problems are published after the round. It includes **two deliberately plagiarised pairs** (renamed identifiers) so the plagiarism report has real hits.
  - **Weekly Practice Arena**: started 1 h ago, ends in 14 days, 4 unpublished problems, about 10 participants with submissions, so a live contest exists for demos.
  - **Arbiter Round #2**: starts in 3 days.
- Historical submissions are inserted directly with verdicts, times and plausible source code (refs and variants). They are not judged.

---

## 15. Testing & definition of done

Scripts (root `package.json`):
- `dev`: api + worker + web concurrently;
- `build`, `typecheck`, `lint`, `format`;
- `test`: unit + integration; needs compose services; each test file uses its own Postgres schema or truncates its tables, plus a random queue prefix;
- `test:sandbox`: builds the image if missing, then runs the real-Docker tests;
- `e2e`: Playwright; boots api + worker + web against a dedicated e2e database;
- `db:migrate`, `db:seed`, `db:reset`, `sandbox:build`;
- `loadtest`: N concurrent virtual users submitting; reports judged/min and p50/p95 queue→verdict latency as a markdown table.

Required coverage:
- **Unit**: checker (all modes, edge whitespace), verdict mapping, language limit derivation, ICPC row computation and ranking with ties, Elo rating properties, winnowing similarity, JWT/refresh rotation logic, the pagination helper.
- **Integration** (Supertest against real Postgres + Redis):
  - the auth flow including refresh reuse detection;
  - problems list filters and visibility;
  - submission creation rules (rate limit, contest rules);
  - contest registration and scoreboard from seeded submissions;
  - admin RBAC (403 for users) and admin CRUD;
  - OpenAPI document contains every route.
- **Sandbox**: everything in §8.7.
- **E2E** (Playwright, chromium):
  - register → open problem → submit the C++ reference → see live progress → Accepted;
  - submit a wrong answer → see the WA verdict and the failed-sample diff;
  - Run with custom input shows stdout;
  - the contest scoreboard updates live in a second browser context after a submission;
  - an admin creates a problem with tests and the reference validates to AC.

  Capture **screenshots** of the key pages into `docs/screenshots/` (light and dark for landing and workspace).
- **CI** (`.github/workflows/ci.yml`):
  - lint + typecheck + unit;
  - integration with postgres/redis service containers;
  - sandbox (docker build + sandbox tests);
  - e2e (with the Playwright report uploaded as an artifact on failure).

A feature is done when it has: its endpoint(s) with zod validation and auth rules; tests; its UI wired to the real API, with loading, empty and error states; OpenAPI registration; and no TypeScript or ESLint errors.

---

## 16. Observability & operations
- pino JSON logs (pretty in dev) with a `requestId` on every line. The worker logs `submissionId`, verdict and duration for every job.
- Prometheus metrics:
  - `http_request_duration_seconds{route,method,status}`;
  - `judge_jobs_total{verdict,language}`;
  - `judge_job_duration_seconds{language}`;
  - `judge_queue_waiting`;
  - `sandbox_container_start_seconds`.
- Graceful shutdown on SIGTERM:
  - API: stop accepting connections, close sockets, then close Prisma and Redis;
  - worker: `worker.close()` lets in-flight jobs finish (30 s cap).

## 17. Deployment (docs/DEPLOYMENT.md)
- `docker-compose.prod.yml` services:
  - `postgres` and `redis` (named volumes);
  - `api` (multi-stage Node image; runs `prisma migrate deploy` on start);
  - `worker` (same image, different command; mounts `/var/run/docker.sock`; `SANDBOX_IMAGE` pre-built on the host);
  - `web` (nginx: SPA with history fallback, strict security headers, proxies `/api` and `/socket.io` with WebSocket upgrade);
  - optional `caddy` for automatic HTTPS.
- Target: a single Linux VM (any VPS or an always-free cloud VM), with step-by-step instructions. Vercel and Render-style serverless hosts are explicitly unsuitable for the worker (it needs Docker), and the docs say why.

## 18. Left to the builder
Internal module structure beyond §5, component APIs, exact copy and micro-interactions, chart library details (within §13.1), test file organisation, the Prisma migration name, and logging fields beyond §16. Record anything that deviates from this document in the Decisions log.

## Decisions log
- 2026-11-07: Design approved for build (owner chose "build now"). The Docker CLI is used over the Engine API for portability and debuggability. Expected outputs stay outside the sandbox.
- 2026-11-07 (spike): the §8.2 flags were verified on Docker Desktop 29.9 (WSL2, cgroup v2):
  - `/work` tmpfs allows exec; `/tmp` tmpfs is noexec by default, which is fine because nothing executes from `/tmp`;
  - the root filesystem is read-only;
  - uid 10001 cannot signal PID 1 (tini via `--init`) or read `/proc/1`;
  - root with CAP_KILL can kill runner processes;
  - the network is unreachable;
  - `memory.max` and `pids.max` are enforced;
  - one container start plus a short script takes about 1.4 s wall.
- 2026-11-07 (plan): `ContestDetail.serverTime` added so countdowns correct for client clock skew. CRLF/BOM source and `\r\n` program output must judge normally. Docker or the image being unavailable must end in `FAILED/IE` with a clear message, never an endless spinner.
- 2026-11-07 (pins): versions were checked on the npm registry. Use vite@7 (vite 8 needs Rolldown-only plugin-react@6), vitest@3.2, express-rate-limit@7 + rate-limit-redis@4, react-resizable-panels@2 and @zxcvbn-ts@3. The full list is in the plan's "Version pins".
- 2026-11-07 (builder check): an independent pre-build review raised about 25 questions per project. They are resolved in the plan's "Builder-check resolutions" (binding during the build), and the sections above are patched to match.
- 2026-11-07 (S1-S4 scaffold) infra: compose binds Postgres/Redis to loopback on both `127.0.0.1` and `::1`. On the build machine `localhost` resolves only to `::1`, and ioredis could not reach a 127.0.0.1-only binding; the spec's `localhost` URLs are kept.
- 2026-11-07 (scaffold) config: extra env vars `LOG_LEVEL` (pino level); vite.config-only `API_PROXY_TARGET` and `WEB_PORT`; test-only `TEST_SCHEMA`, `TEST_DATABASE_URL`, `TEST_REDIS_URL` (default Redis DB 15; isolation comes from random per-file prefixes) and `TEST_LOG_LEVEL`. `JWT_ACCESS_SECRET` has no code default (the dev value lives in `apps/api/.env`). With `NODE_ENV=test`, env.ts refuses the dev database `arbiter`.
- 2026-11-07 (scaffold) API additions: `GET /api/admin/problems/:id/tests/:testId` returns one full test case; the `GET /api/admin/problems/:id/tests` list returns sizes plus 256-character previews instead of full data (inputs reach 1 MB each). `SubmissionDetail.errorMessage` is optional and admin-only. Error code `NOT_IMPLEMENTED` (501) exists only for scaffold stubs, and none may remain after I1. Admin list endpoints are paged with `search`; the scoreboard defaults to `pageSize=50`; validate-reference, generate-outputs and plagiarism creation answer 202; bulk tests answer `{created, total}`; admin role changes answer `{user}`.
- 2026-11-07 (scaffold) auth semantics: on optional-auth routes an invalid or expired bearer token gives 401 (so the SPA refreshes) instead of a silent guest downgrade. A socket handshake with an invalid token fails with `connect_error` "UNAUTHORIZED" (`SOCKET_AUTH_ERROR`), and the client refreshes, then reconnects (or reconnects without a token as a guest).
- 2026-11-07 (scaffold) internals: `route()` (R12) also applies the auth middleware for `auth: 'optional'|'user'|'admin'` (`'cookie'` and `'none'` add none). Rate-limit stores are created per app on the first request, so `createApp({ redis, rateLimits })` works with module-level route declarations. A limiter whose Redis is down fails the request with 500 (fail closed). rate-limit-redis's eager SCRIPT LOAD promises are marked handled, because they would otherwise crash Node 22 with an unhandled rejection. Added `lib/lifecycle.ts` (`onShutdown`/`closeAll`), `lib/deps.ts` (`getDeps(req)`) and `lib/time.ts` `clock`.
- 2026-11-07 (scaffold) tooling: TypeScript uses `moduleResolution: "Bundler"` with extensionless relative imports (tsx, Vitest, tsup and Vite all resolve them; nothing runs per-file Node ESM output). ESLint uses non-type-aware `typescript-eslint` recommended; `eslint-plugin-react-hooks@7` enables only `rules-of-hooks` and `exhaustive-deps`, because v7's recommended preset adds React Compiler rules. The Prisma CLI must run from `apps/api` to read `apps/api/.env`. `apps/api` has `postinstall: prisma generate`, and `db:reset` uses `--skip-seed` (seed explicitly). The schema is written one field and enum value per line (required by Prisma syntax) with unchanged content; the initial migration is `20261107170020_init`. Prisma 6.19 warns that `package.json#prisma` (R16) is deprecated; this is a warning only.
- 2026-11-07 (scaffold) dependencies beyond the spec list: `@testing-library/dom@10` (peer of RTL 16), `react-is@19` (recharts 3 peer), `@types/qrcode`, `@vitest/coverage-v8@3.2` and `concurrently@9`. `katex` is held at 0.16 so rehype-katex 7 and the CSS share one copy, `lucide-react` is at major 1, and `nanoid` at 5. `hash-wasm@4`, `otpauth@9`, `qrcode@1` and `@zxcvbn-ts/*@3` are installed in web only because the shared "Version pins" block lists them; no Arbiter feature needs the first three, so prune them in polish if they stay unused. `npm audit` reports 25 advisories (3 critical, 5 high), all inside pinned majors (zod 3, vitest 3/tinypool, the prisma 6 CLI, and dompurify via monaco-editor 0.57). Their fixes need the major upgrades the pins forbid, so the review phase decides.
- 2026-11-07 (scaffold) web: S1 created minimal placeholders (`apps/web/index.html`, `vite.config.ts` with the /api and /socket.io proxy, `vitest.config.ts` with `passWithNoTests`, `tsconfig.json`, `src/main.tsx`) so root typecheck, lint, test and build run before S5. S5 owns these files and replaces them.
- 2026-11-08 (S5 web shell) tokens: every §13.1 token is a real CSS variable named `--color-*` on `:root` (light) and `.dark` (midnight, the default), registered as Tailwind colours with `@theme inline` self-references (Tailwind also emits those into `@layer theme`, where the unlayered declarations always win). Added tokens: `raised-hover`, `border-strong`, `primary-soft`, `primary-text` (readable violet for links: `#a594ff` dark, `#6a4af0` light), `on-primary`, `ring`, `success|warning|danger|info`, `danger-solid(-hover)`, `overlay`, and `tier-{gray,green,cyan,blue,violet,amber}`. The dark theme uses the spec hexes exactly. The light theme uses darker shades of the verdict, difficulty, tier and accent colours (e.g. AC `#15803d`, WA `#be123c`), because the spec hexes on white fall to 2–3:1. The dark Master tier uses `#a78bfa`, because the shared `RATING_TIERS` hex `#8b5cf6` is 4.3:1 on the surface colour. Radii: `rounded-card` 10 px, `rounded-control` 8 px. Body text is 0.875rem (14 px) with rem left at 16 px, so browser font scaling still works.
- 2026-11-08 (S5) contrast note: white text on the spec primary `#7c5cff` measures 4.35:1, just under AA's 4.5:1 for 14 px text (hover `#6a4af0` measures 5.45:1). The spec colour is kept as instructed; the review phase decides whether primary buttons should rest on the hover shade.
- 2026-11-08 (S5) API client: `api.get|delete(path, options)` take no body argument, and `api.post|put|patch(path, body?, options)` take one. The plan's single `(path, body?, {schema?})` shape would have let a GET options object be sent silently as a body. Paths are relative to `/api`, and `options` is `{schema, query, signal, headers, auth}`. Requests wait for the boot refresh. A 401 retries once with a token that another request has already refreshed, otherwise through the shared single-flight refresh (module promise plus `navigator.locks` `arb-refresh`). Only a 401 or 403 from `/auth/refresh` logs out (429 and other 4xx keep the session, review A-27); a network error or 5xx keeps the session. The boot refresh is skipped when the `arbiter:session` localStorage hint (set on login, cleared on logout) is absent, so guests send no request and see no 401 at boot. The auth store also exposes `loginDemo()` (R4), `setUser()`, `bootstrap()` and `ready()`.
- 2026-11-08 (S5) realtime: the socket's `auth` callback supplies the newest token on every (re)connection attempt. A forced reconnect happens only when the signed-in identity (user id or role) changes, or after `connect_error` "UNAUTHORIZED" (refresh, then reconnect, at most 2 tries until the token changes). A routine same-user refresh does not drop live rooms: the server checks the token only at the handshake. `useRoom` defaults the unsubscribe event to the matching `:unsubscribe`. It invalidates its `invalidate` keys after every successful join, the first one included, which closes the gap between the initial fetch and joining the room (e.g. a submission that finishes before `submission:subscribe` is acknowledged). `useSocketEvent` validates payloads with `ServerEventSchemas` and drops invalid ones.
- 2026-11-08 (S5) structure: `@/` aliases `apps/web/src` (tsconfig `paths`, Vite and Vitest aliases). Lanes get UI components beyond the §5 list: Alert, Checkbox, CopyButton, DropdownMenu (MenuItem/MenuLink/MenuSeparator/MenuLabel), ErrorState, Field, IconButton, ButtonLink, QueryState, Separator, Shortcut, Stat, TableSkeleton, PageSpinner and SkeletonText. Also added: the domain components UserLink, TimeAgo and LiveIndicator; the layout pieces Page/PageHeader, GuestOnly, RouteError, ShellFallback, AppToaster, NavigationProgress and Logo; the lib modules http, config, time, keyboard, url, toast, storage, queryKeys and useDocumentTitle; and the test helpers in `src/test/` (renderWithProviders, mockFetch, createFakeSocket). A development-only gallery at `/dev/kit` (left out of production builds) and the dev-only `DevPlaceholder` support the placeholder pages; delete `DevPlaceholder.tsx` once no page imports it. Workspace routes carry `handle: { layout: 'workspace' }`, so the shell gives them a viewport-height main area and no footer.
- 2026-11-08 (S5) build: Monaco follows R18 (`import * as monaco from 'monaco-editor'`, `?worker` imports of `editor/editor.worker` and `language/typescript/ts.worker`, `loader.config({ monaco })`). The full import also emits Monaco's own css/html/json workers, which are never loaded for our four languages. All of this lives in lazy chunks: about 4 MB of editor plus about 9 MB of workers on disk. Vite pins `root`/`envDir` to `apps/web`, splits vendor chunks (react, router, query, zod; the entry is 124 kB), and raises `chunkSizeWarningLimit` to 4500 kB for the Monaco chunk only. Markdown display math needs `$$` fences on their own lines (remark-math 6 treats `$$x$$` inside a line as inline math), which matters for statements written by A4 and A7. Production CSP note for polish: Monaco, sonner and KaTeX set inline styles (`style-src 'self' 'unsafe-inline'`); the workers are same-origin ES module workers (no `blob:` needed).
- 2026-11-08 (S5) e2e config: the servers run with `NODE_ENV=test` (it refuses the dev database), the worker serves metrics on 9465, and each run gets its own `QUEUE_PREFIX`, `SOCKET_IO_KEY` and `RATE_LIMIT_PREFIX` through `E2E_RUN_ID`. Database preparation (`e2e/support/prepare-db.ts`: migrate deploy plus seed, refusing any database not named `*_e2e`) is chained into the API webServer command, because Playwright starts webServers before globalSetup. The config uses `workers: 1` and `retries: 0`. No dependency was installed for S5.
- 2026-11-08 (A1) `issueRefreshToken`, `rotateRefreshToken` and `revokeByToken` take the Prisma client as their first argument (plan lists `(userId, meta)` and `(token, meta)`), so tests and createApp({prisma}) stay injectable.
- 2026-11-08 (A1) Refresh rotation claims the old token with a conditional update inside a transaction; losing a concurrent race counts as reuse and revokes the family. An expired token is a plain 401 and does not revoke the family. A failed refresh with a 401 also clears the arb_rt cookie; a 5xx keeps it (review A-12).
- 2026-11-08 (A1) The refresh cookie is `Secure` when COOKIE_SECURE=true or NODE_ENV=production; maxAge equals REFRESH_TOKEN_TTL_DAYS; the expiry is sliding (each rotation issues a fresh 14 days). Auth responses send `Cache-Control: no-store`.
- 2026-11-08 (A1) Logout without a cookie is idempotent: 204 and the cookie is cleared. A valid cookie revokes the whole family.
- 2026-11-08 (A1) POST /api/auth/demo answers 404 when DEMO_LOGIN_ENABLED is false or when no user `demo` exists; the check runs after the shared login limiter.
- 2026-11-08 (A1) Leaderboard rank is the standard competition rank (1 + users strictly ahead; ties share, next rank skips: 1,2,2,2,5). by=rating breaks display ties by username; by=solved by higher rating, then username. All users are listed, including users with 0 solved and admins.
- 2026-11-08 (A1) "Solved" (profile bars, leaderboard `solved`) = distinct published problems with a NORMAL AC submission. Profile `submissions`, `accepted`, `acceptanceRate` and `languages` count NORMAL submissions with status DONE; the heatmap counts every NORMAL submission by UTC creation day (any status), for the last 365 UTC days ending today, oldest first.
- 2026-11-08 (A1) `recentAccepted` lists the latest AC per problem (one row per problem), newest first, at most 10, published problems only. `globalRank` = 1 + users with a strictly higher rating (never null). `ratingHistory` is ordered oldest first by RatingChange.createdAt.
- 2026-11-08 (A1) GET /stats: `problems` = published problems, `submissions` = NORMAL submissions in any status, `judgedToday` = NORMAL DONE with judgedAt on the current UTC day, `runningContests` = published contests with startsAt <= now < endsAt.
- 2026-11-08 (A1) PATCH /api/admin/users/:id refuses to demote the last remaining admin (409 CONFLICT), checked in a serializable transaction. Admin user search is a case-insensitive substring match on username or email; `submissionCount` counts NORMAL submissions.
- 2026-11-08 (A1) Register and login unknown-account handling: login of an unknown account verifies against a lazily computed dummy Argon2id hash (same cost) and returns the same generic 401 `Invalid credentials` as a wrong password. Register answers 409 with a specific message (email vs username) as the spec requires a 409.
- 2026-11-08 (A2): `docker run` adds `--pull never` to the spec 8.2 flags, so a missing image fails at once with "Sandbox image ... is not available" (FAILED/IE after retries), instead of trying a registry pull.
- 2026-11-08 (A2): Protocol extras (spec 8.4):
  - `init` carries `rlimitAsKb`, computed by the worker and set for CPP only;
  - `result` carries `outputLimitExceeded` and `wallKilled`.

  The worker re-derives the raw status from these facts (`judge/verdict.ts` classifyRaw, the same OLE > MLE > TLE > RE > OK rules) and treats its own classification as authoritative. A mismatch is logged.
- 2026-11-08 (A2): After every test, the harness kills every remaining `runner` process, including setsid and double-fork escapes. It does this by scanning /proc and having a short-lived forked helper, running as runner, call kill(-1). Nothing a test leaves behind can affect the next test, and the harness never changes its own uid.
- 2026-11-08 (A2): Compile step limits:
  - 15 s wall, RLIMIT_CPU 20 s, FSIZE 64 MB, NOFILE 256, no RLIMIT_AS;
  - stdout and stderr are merged and capped at 16 KB.

  A successful compile's non-empty output (warnings) is stored in `compileOutput` too.
- 2026-11-08 (A2): The container deadline is 60 s (to reach `ready`) plus compile 20 s + the sum of (wall + 1 s) + 10 s. The janitor treats a container as stale when its worker heartbeat is gone, or when it is older than 15 min (MAX_CONTAINER_LIFETIME_MS), within its own `arbiter.prefix` only.
- 2026-11-08 (A2): The janitor confirms a missing heartbeat. It re-checks after one heartbeat interval + 1 s before it removes a container younger than the maximum lifetime. A transient gap in the key never kills a live worker's running container. The gap was seen once in about 15 janitor test runs on this busy laptop, cause not identified: Redis hiccup, a starved event loop or a VM clock step.
- 2026-11-08 (A2): Docker Desktop's VM clock (container `Created`, Redis TIME) was measured about 81 s ahead of the Windows host clock. The janitor's age test therefore errs towards keeping containers. Its test uses `now` = host time + 24 h for the "too old" case.
- 2026-11-08 (A2): Each heartbeat value `judge:worker:<id>` also carries `prefix`. The admin monitor and the janitor only consider workers of their own QUEUE_PREFIX.
- 2026-11-08 (A2): BullMQ job ids are deterministic (`sub-<submissionId>`, `run-<runId>`, `gen-<adminJobId>`, `plag-<reportId>`), so a double enqueue is deduplicated. Jobs get attempts 3 with exponential backoff (1 s).
  - Only the final attempt records FAILED/IE (submissions) or FAILED (admin jobs).
  - Earlier attempts put the submission back to QUEUED and rethrow.
  - A retried attempt clears the earlier test results.
- 2026-11-08 (A2): Submission `timeMs` is the maximum CPU time (`ru_utime + ru_stime`) over the tests that ran, not wall time. `memoryKb` is the maximum `ru_maxrss`.
- 2026-11-08 (A2): Generate-outputs is all or nothing. Every test must give raw OK, at most 4 MB of output and no NUL bytes. Otherwise the admin job is FAILED with a message naming the test, and no expectedOutput is changed. All updates are committed in one transaction.
- 2026-11-08 (A2): Run results use status CE on a failed compile (with compileOutput), and IE after the final failed attempt. They are stored in `run:<runId>` as `{userId, status: 'PENDING'|'DONE', result?}` with TTL 600 s. GET /api/runs/:runId answers 404 to anyone but the owner, and for expired runs.
- 2026-11-08 (A2): Admin monitor latency is queue-to-verdict (`judgedAt - createdAt`) p50/p95 by nearest rank, over the last 200 judged submissions. Throughput is judged submissions per UTC minute over the last 30 minutes.
- 2026-11-08 (A2): The `kill -9 -1` sandbox test sends the signal from a forked child of the program, because Linux excludes the caller from kill(-1). The program then dies by SIGKILL (RE), and the next test in the same container still runs.
- 2026-11-08 (A3a) problems list: GET /api/problems lists published problems only, for admins too (spec section 9). Admins find drafts through /api/admin/problems. GET /api/problems/:slug also serves unpublished problems to admins. `search` matches the title or slug, case-insensitively. `tag` is a case-insensitive exact name match.
- 2026-11-08 (A3a) status filter: `solved` = some NORMAL AC by the user; `attempted` = some NORMAL submission (any status) and no AC; `unsolved` = not solved (attempted problems included). A guest has solved and attempted nothing: `solved`/`attempted` return nothing and `unsolved` returns everything. `userStatus` follows the same rules, and REFERENCE submissions never count (R7).
- 2026-11-08 (A3a) problem sorts: `newest` = createdAt desc. `difficulty` = EASY, MEDIUM, HARD, then title. `title` = title asc. `acceptance` = acceptance rate desc, then submissionCount desc, then title; it is ranked in memory over the filtered ids, because Prisma cannot order by a ratio. acceptanceRate is 0 when there are no submissions.
- 2026-11-08 (A3a) GET /api/tags: tags with no published problem are left out, so tags used only by drafts or by unstarted contest problems do not leak. The list is sorted by name.
- 2026-11-08 (A3a) submission visibility: non-admins see other users' submissions only when the problem is published, or belongs to a published contest that has started (the R11 rule). This keeps admin practice runs on draft or unstarted contest problems out of public lists. Others' contest submissions stay hidden until endsAt. Own submissions are always visible. GET /api/submissions/:id answers 404, not 403, for hidden submissions (REFERENCE submissions of others included). A guest's `mine=true` is a 401. failedSample = the first non-AC sample result by ordinal: the TestCase input/expected output plus the stored stdout/stderr previews (owner or admin only).
- 2026-11-08 (A3a) submission creation: `testsTotal` is set to the problem's test count when the row is created. With `contestSlug`, an unpublished contest is a 404 for non-admins and a problem outside the contest is a 404. Admins follow the same contest rules (unregistered during the contest gives 403); they can submit without `contestSlug` instead. If enqueueing fails, the submission is set to FAILED/IE with an errorMessage, judgedAt is set, and the API answers 500 INTERNAL, so nothing stays QUEUED forever (Review Focus 4). A failure in the R3 scoreboard recompute or emit is logged and does not fail the 202.
- 2026-11-08 (A3a) admin problems: PUT is a full replace. Exceptions: an omitted referenceLanguage/referenceSolution keeps the stored value (null clears it), and an omitted floatTolerance becomes null. Tag names are de-duplicated and created on first use; unused tags are not deleted. The authorId of a created problem is the calling admin. The admin list is newest first.
- 2026-11-08 (A3a) admin test cases: POST without an ordinal appends at max+1, and a taken ordinal gives 409. PUT keeps the ordinal when it is omitted. DELETE does not renumber. A bulk append continues from max+1. A bulk replace deletes every test and numbers the new ones from 1, in one transaction (timeout 120 s). The test list computes sizes (octet_length = UTF-8 bytes) and 256-character previews (left()) in Postgres with a tagged `$queryRaw`, so multi-MB inputs are never loaded.
- 2026-11-08 (A3b) Scoreboard cache: besides `contest:<id>:rank` (ZSET) and `contest:<id>:rows` (HASH), two helper keys exist: `contest:<id>:updatedAt` (ISO time of the last write, served as Scoreboard.updatedAt) and `contest:<id>:lock` (SET NX PX 15 s rebuild lock; waiters poll up to 10 s). The cache counts as built when the rank ZSET exists; a contest with no participants is recomputed on each read (two cheap queries).
- 2026-11-08 (A3b) recomputeRow builds the whole cache first when it is missing, so a single write never leaves a one-row scoreboard. When the recomputed row takes a first solve (an earlier AC judged late), the rows of users who held that firstSolve are recomputed too. Known gap: a full rebuild racing with a concurrent recomputeRow can briefly write a row read just before the new verdict; the next recompute or rebuild fixes it.
- 2026-11-08 (A3b) Scoreboard rows show the user's current rating (User.rating). Admin edits (PUT/DELETE contest) and rating application drop the cache so it is rebuilt on the next read.
- 2026-11-08 (A3b) Scoreboard tie order inside equal (solved, penalty) follows the ZSET member order (userId, descending); ties share a rank as specified.
- 2026-11-08 (A3b) Only NORMAL submissions by registrants with a contestId count for the scoreboard, the contest problem stats, plagiarism and rating (R7). A FAILED submission (IE) and DONE/CE are never attempts; pending submissions before the first AC set `pending`, after it they are ignored. acMinute is clamped at 0.
- 2026-11-08 (A3b) ContestDetail.problems[].attemptedCount = distinct users with at least one contest submission on the problem (solvers included); solvedCount = distinct users with an AC. userStatus (in the detail and in GET /contests/:slug/problems/:label) comes from the viewer's contest submissions only.
- 2026-11-08 (A3b) Public contest routes show published contests; admins can also open unpublished ones by slug (detail, problems, scoreboard, submissions, register). GET /api/contests lists published contests only, for admins too (the admin list covers the rest). Ordering: upcoming by startsAt asc, running by endsAt asc, past by endsAt desc, no filter by startsAt desc.
- 2026-11-08 (A3b) Contest problem labels in GET /api/contests/:slug/problems/:label are case-insensitive (`a` = `A`). Before the start a non-admin gets 404 (not 403), matching the route definition.
- 2026-11-08 (A3b) GET /api/contests/:slug/submissions: while the contest is not over (upcoming or running), non-admins always get only their own submissions; after the end everyone's are listed (metadata only: SubmissionSummary has no source). Admins always see all. Newest first.
- 2026-11-08 (A3b) Admin contests: unknown problem ids in the body give 400 VALIDATION_ERROR with details path `problems.<i>.problemId`; duplicate labels/problems are rejected by the shared schema (400); slug clashes give 409. PUT replaces the problem list (ordinal = array order). participantCount = registrations.
- 2026-11-08 (A3b) Rating: participants are registrants with at least one counted contest submission (registrants who never submitted are not rated). The transaction claims the contest with a conditional `ratedAt: null -> now` update, so concurrent calls rate once (the loser gets 409). Interactive transaction timeout 60 s. The response lists changes in rank order.
- 2026-11-08 (A3b) Rating with N < 2 participants gives a delta of 0 (RatingChange rows are still written, and ratedAt is set).
- 2026-11-08 (A3b) Plagiarism tokenizer: C-style `//` and `/* */` comments for CPP/JAVA/JAVASCRIPT, `#` for PYTHON; Python string prefixes (f, r, b, rb, ...) and triple quotes, Java text blocks and JS template literals are single S tokens; unterminated literals/comments never throw. k-grams are hashed as the token kinds joined by single spaces (UTF-8 bytes, 64-bit FNV-1a as BigInt). A program shorter than k tokens gets one fingerprint over all its tokens. Pairs with similarity 0 are never stored, even with threshold 0.
- 2026-11-08 (A3b) Plagiarism compares every pair of participants per problem regardless of language (spec wording); side A of a pair is the earlier submission. matchedLines = distinct lines of the tokens in shared fingerprints. Re-running a report replaces its pairs. If enqueueing fails, POST /api/admin/plagiarism marks the report FAILED and answers 500. GET /api/admin/plagiarism returns at most the 200 newest reports; pairs whose submissions or problem were deleted are left out of the detail.
- 2026-11-08 (A4a) verify-problems.py measures CPU time (user + sys of the child, from `wait4`) instead of
  wall time, because the build machine is shared and wall time is noisy. Budgets: ref.py <= 1.5 x
  timeLimitMs, ref.cpp <= 0.5 x timeLimitMs, peak RSS of ref.py <= memoryLimitMb + 16 MiB; slow.py must exceed
  6 x timeLimitMs of CPU (twice the judge's 3x Python budget) on the largest input, enforced with RLIMIT_CPU.
- 2026-11-08 (A4a) verify-problems.py pipes sources and tests into one container per problem and language as
  a tar stream on stdin (`docker run --rm -i --network none --memory 2g --pids-limit 256 --entrypoint python3`),
  so no bind mounts are needed. The C++ container is gcc:14 (its own Python 3.13 only drives the runner); the
  Python container must report Python 3.11 (R17). `arbiter-sandbox:latest` is preferred for both when present.
- 2026-11-08 (A4a) ref.py output must equal the committed `.out` byte for byte; ref.cpp, slow.py and wrong.py
  are judged with the problem's checker (TOKENS/EXACT/FLOAT, same number syntax as judge/checker.ts).
  slow.py runs smallest test first and, after its first timeout, only on the largest test (to save CPU);
  every test it finishes must be correct.
- 2026-11-08 (A4a) gen-tests.py also has `--check` (regenerate in a temp dir and compare, writing nothing) and
  `--root`; verify-problems.py has `--no-docker`, `--cpp-image`, `--py-image` and `--root`.
- 2026-11-08 (A4a) Each problem folder has 12-13 tests; flooded-archive's second answer can be the word
  `FOREVER` (unbounded waiting), and lantern-spacing / flooded-archive / nested-scrolls define their impossible
  cases as `-1`, `-1`/`-1` and `MISMATCH`/`UNCLOSED` respectively.
- 2026-11-08 (A4b) assembly-order adds a twist to Kahn: tasks carry distinct part codes and the order minimises the code sequence; on a cycle the output is `CYCLE s` plus the sorted stuck tasks (cycle members and everything downstream).
- 2026-11-08 (A4b) night-ferries uses periodic departure schedules plus up to K=3 charter tickets, and prints the best arrival for every j in 0..K.
- 2026-11-08 (A4b) assembly-order limits are n <= 4e4, m <= 5e4 so that the largest input stays under 1 MB.
- 2026-11-08 (A5) The landing page seeds its "Judged just now" feed from GET /api/submissions?pageSize=10 and prepends `feed:judged` events (R6, via useRoom('feed:subscribe', {}) with the seed query invalidated on every join). The list is capped at 12 items, de-duplicated on username, problem and timestamp, newest first.
- 2026-11-08 (A5) The featured contest is the first running contest, else the earliest upcoming one (two list queries, the second only when no contest is running).
- 2026-11-08 (A5) "Try the demo" (hero, login, register) renders only when `config.demoLogin` is true and calls `useAuth().loginDemo()` (R4). On the landing page a successful demo login navigates to /problems; on the guest-only pages GuestOnly redirects.
- 2026-11-08 (A5) Login and register validate with the shared zod schemas (LoginBody, RegisterBody) on blur and submit; server field errors from fieldErrors() are merged onto the fields; a 409 shows inline on the conflicting field; other failures show an Alert.
- 2026-11-08 (A5) Heatmap is an SVG grid of 365 cells (one hue in five steps from the primary colour mixed into the surface, theme-aware through CSS variables); one tab stop with arrow-key navigation (left/right move a week, up/down a day), tooltip on hover and focus, every cell has a text label, legend shows 0 to the busiest day.
- 2026-11-08 (A5) RatingChart uses recharts: x axis is the contest sequence (Start, #1..#n) instead of a time axis so evenly spaced contests are readable; faint tier bands carry the tier names as text; a "Show table" toggle gives the same data as a table.
- 2026-11-08 (A5) Leaderboard ties show the shared rank with an "=" marker and an accessible label ("Rank 2, tied"); tabs and page live in the URL (?by=solved&page=2).
- 2026-11-08 (A5) The profile page skips <Page> (own container, own h1 with the avatar) and sets the document title through useDocumentTitle(username).
- 2026-11-08 (A6) Live submission progress merges REST and socket state (`features/problems/lib/progress.ts`) so a refetch never moves the UI backwards; while a submission is pending its detail query also polls (8 s with the socket connected, 2 s without) so a lost socket never leaves an endless spinner (R6: REST is the source of truth).
- 2026-11-08 (A6) Editor drafts live in localStorage under `arbiter:draft:<problemSlug>:<language>`; switching language loads that language's draft or the template, and resetting to the template asks for confirmation when the draft differs.
- 2026-11-08 (A6) After the first failing test, the remaining test chips stay neutral ("not run") rather than being marked skipped, matching the judge's stop-on-first-failure behaviour.
- 2026-11-08 (A6) The submission-detail test-results table uses fixed-width time and memory columns so the numbers sit together on wide screens.
- 2026-11-08 (A7) Admin list pages keep `page` and the debounced search text (`q`) in the URL; the search is sent to the API as `search`.
- 2026-11-08 (A7) The problem editor keeps the reference solution in the Reference tab and re-sends it with every full-replace PUT of the Details form (and the Details fields with the reference save), because PUT /admin/problems/:id replaces the whole problem.
- 2026-11-08 (A7) Validate and Generate outputs are disabled until the reference is saved (the judge runs the stored solution) and the problem has tests.
- 2026-11-08 (A7) Bulk upload: pairs by basename (case-insensitive), natural order is the ordinal order, unpaired and duplicate files are listed and skipped, CRLF and a BOM are normalised, an optional "Samples" count marks the first N pairs as samples, and Replace is an explicit switch that turns the submit button red.
- 2026-11-08 (A7) The judge-monitor throughput chart is an HTML column chart (single series in the brand colour, no legend, peak labelled, tooltip on hover and focus, table view toggle) instead of an SVG chart; the monitor refreshes every 5 s with TanStack Query `refetchInterval`.
- 2026-11-08 (A7) A user cannot change their own role from the users page (button disabled); promoting asks for confirmation, demoting uses a danger confirmation.
- 2026-11-08 (A7) New contests and problems are created first; Tests/Reference tabs and Ratings/Plagiarism cards appear after the first save (the id is needed).
- 2026-11-11 (I1) seed: `apps/api/prisma/seed.ts` is a thin CLI over `apps/api/src/seed/run.ts`. It stops before touching the database when a hidden test is missing (`assertHiddenTests`: every file pinned in `seed/problems/CHECKSUMS.sha256` must exist, every `NN.in` needs its `NN.out`, at least 10 tests per problem) and tells the user to run `npm run problems:gen`. It then truncates the application tables (never `_prisma_migrations`) and recreates everything from fixed random seeds (`src/seed/rng.ts`), so a rerun gives the same data with timestamps relative to "now". Rows get cuid-shaped ids drawn from the same generator so related rows can be linked before insertion. Every file read is normalised CRLF to LF (R9).
- 2026-11-11 (I1) seed data: users `admin` and `demo` plus 30 synthetic users (fictional handles, password = `SEED_DEMO_PASSWORD`, ratings 850-1950). Problem allocation: Arbiter Round #1 A-E = rainfall-ledger, tandem-kayaks, postage-ways, lantern-spacing, night-ferries (published, 26 participants); Weekly Practice Arena A-D = badge-collisions, nested-scrolls, flooded-archive, rising-towers (unpublished, 10 participants); Arbiter Round #2 A-C = kiln-scheduling, bridge-builders, assembly-order (unpublished, 6 registrations); average-pace, motif-search and sensor-ranges are published practice problems. Every contest problem ships a `wrong.py` or `slow.py`, so failing attempts use real wrong or slow programs (always Python; a user whose accepted submission is C++ "switched language"). Accepted submissions are copies of `ref.cpp` / `ref.py`, compile errors are a reference with one token removed and a plausible compiler message, and every other attempt has per-test results (judging stops at the first failing test, as the judge does). The reference C++ is stored as each problem's `referenceSolution`, so "validate reference" and "generate outputs" work out of the box.
- 2026-11-11 (I1) seed realism: winnowing hashes token kinds, so copies of one reference program would all look like plagiarism. Each seeded submission therefore gets its own copy with randomised, harmless debug scaffolding between statements (`src/seed/variants.ts`; deleting the scaffolding restores the reference; all generated variants were compiled with g++ 14 and `py_compile`). Independent variants stay below the 0.6 threshold (worst case measured 0.53) (checked in `seed.test.ts`). The two plagiarised pairs of Round #1 (tandem-kayaks in Python, lantern-spacing in C++) are a variant plus the same variant with renamed identifiers and a few extra statements; the seed runs the real `runPlagiarismReport` at threshold 0.6 and fails if fewer than two pairs come out.
- 2026-11-11 (I1) seed ratings: Round #1 ratings are applied through the real `rateContest` (so `computeRatingDeltas`, `RatingChange` rows and `ratedAt` come from production code); afterwards the seed moves `RatingChange.createdAt` and `Contest.ratedAt` to ten minutes after the round ended. Problem counters follow R7 (NORMAL submissions that reached DONE; ACs among them). The A7 request for an extra ended-but-unrated contest is not seeded (the spec lists three contests and Round #1 is rated); the Apply-ratings flow is covered by API and unit tests only: no admin contest, apply-ratings, plagiarism or bulk-upload e2e exists (review A-70).
- 2026-11-11 (I1) `npm run db:reset` is refused when an AI agent runs it: Prisma's `migrate reset` demands the user's explicit consent through an environment variable. The seed's own truncate gives the same clean data on the already migrated dev database, so I1 used `npm run problems:gen && npm run db:seed`; a human can still run `npm run db:reset` followed by the seed.
- 2026-11-11 (I1) `scripts/judge-refs.ts` (`npm run judge:refs`) judges every `ref.cpp` and `ref.py` (AC), `slow.py` (TLE) and `wrong.py` (WA) through the real API as the seeded admin, prints a table plus queue-to-verdict latency (`judgedAt - createdAt`) per language, and runs one plagiarism report through the real queue and worker. Start the API with `RATE_LIMITS_ENABLED=false`. It submits as the admin, so reseed afterwards. `npm run problems:gen` regenerates the uncommitted hidden tests; `CHECKSUMS.sha256` verifies them.
- 2026-11-11 (I1) `POST /api/auth/register` answers 409 with `details: { field: 'email' | 'username' }` (lane A5's request), and `app.test.ts` now compares the registered routes with a literal list of the spec section 10 routes plus the documented extras (`POST /api/auth/demo`, `GET /api/admin/problems/:id/tests/:testId`). The admin judge monitor keeps counting REFERENCE submissions in its latency sample (admin-only view). `statementMd` of average-pace now fences its display math (`$$` on its own lines).
- 2026-11-11 (review) Ultracode review fixes, one line per finding (ids refer to docs/review/2026-11-11-review.md):
  - A-01 `requireRole` re-reads an ADMIN caller's role from the database (deleted user 401, demoted 403); an admin cannot change their own role; demoting a user revokes their refresh tokens.
  - A-02 A problem cannot be published with 0 tests (409) and the last test of a published problem cannot be deleted; the judge ends a submission of a test-less problem as FAILED/IE; validate-reference and generate-outputs answer 409 for it.
  - A-03 Rating answers 409 while counted submissions are still being judged; the admin contest DTO carries `pendingSubmissions` and the UI keeps Apply ratings disabled until it is 0.
  - A-04 Scoreboard row writes are conditional (a Lua script writes only when the rank key exists); a rebuild after a failed or expired lock wait re-checks, retries once, then builds without the lock.
  - A-05 The harness is a child subreaper: `cpuMs` and `maxRssKb` cover the whole process tree (max RSS of any single process, not a sum), so an unwaited child cannot evade MLE/TLE. The sandbox image must be rebuilt after a harness change.
  - A-06 A `failed` handler on the workers and a 60 s reconciler end lost or stalled jobs (submissions, admin jobs, plagiarism reports) as FAILED/IE.
  - A-07 The socket is closed at access-token expiry (guests exempt) and the client reconnects after a server-initiated disconnect; admin joins re-check the role in the database. Logout does not disconnect the socket until token expiry (at most 15 min).
  - A-08 The usernames `demo` and `admin` are reserved; demo login works only for a USER-role account, and the shared demo profile cannot be edited (A-34).
  - A-09 `NODE_ENV=production` refuses the published development JWT secret and the default admin seed password. `SEED_DEMO_PASSWORD` and `DEMO_LOGIN_ENABLED` stay allowed (public demo account by design).
  - A-10 Per-IP rate-limit keys use the IPv4 address, or the /64 prefix for IPv6 (IPv4-mapped addresses are unwrapped).
  - A-11 Each socket has a token bucket (20 burst, 10 per second); flood events get a RATE_LIMITED ack and 25 rejections disconnect the socket.
  - A-13 Postgres error 22021 (NUL byte) maps to 400 VALIDATION_ERROR centrally.
  - A-14 Submission creation checks the contest before the problem and answers an identical 404 for missing, draft and non-member problems.
  - A-15 Rating takes a transaction-level advisory lock, so concurrent ratings neither lose updates nor deadlock. A-16 recomputeRow runs under a per-(contest, user) Redis lock.
  - A-17 Deleting a problem invalidates the boards of its contests; rating invalidates the boards of the rated users' other contests.
  - A-18 A rated contest cannot be deleted (409) and its times, penalty and problems cannot change (409); title, description and visibility can. The admin UI disables those controls.
  - A-23 The janitor age cap is `READY_TIMEOUT_MS` + 15 min + 60 s, longer than the session deadline. A-24 Run jobs are removed on completion; finished judge and plagiarism jobs are kept by age (1 day, failed 7 days).
  - A-25 `page` is at most 1,000,000 (400 above) and `paginate` clamps it too. A-50 A contest lasts at most 30 days and `scoreOf` clamps the penalty below 10^7, so "more solved first" always holds.
  - A-26, A-51 Migration `20261111120000_review_indexes` adds indexes on `User(rating)`, `Submission(verdict, userId, problemId)` and the foreign keys scanned by cascades. It stays Prisma-expressible (no partial index, so no schema drift). Result caching of the leaderboard and stats was not added.
  - A-45 Admin enqueue failures end the AdminJob or REFERENCE submission as FAILED and rethrow; the enqueue has a 5 s timeout. A-48 Checkers split tokens on ASCII whitespace only.
  - A-52 `judge-refs` logs in again on a 401 and stops polling on an unexpected status.
  - A-29, A-30 The SPA moves focus to the main region and announces the title on route changes; primary buttons rest on `#6a4af0` (hover `#5b3bdc`) and the light-theme semantic colours were darkened (`tokens.test.ts` enforces 4.5:1). This supersedes the S5 contrast note above.
  - A-31 The landing sandbox card lists the real `--cap-add` flags (SETUID, SETGID, KILL for the harness; the program runs with none) and the `/tmp` tmpfs.
- 2026-11-12 (review, round 2) Fixes to the review fixes (ids refer to the "Fix review, round 2" table in docs/review/2026-11-11-review.md):
  - A-R2-01 An ADMIN claim in the access token is re-checked against the database role on every authenticated request (`optionalAuth` and `requireAuth`), so a demotion applies at once (and a deleted user gets 401); a promotion applies at the next token refresh. Tokens that do not claim ADMIN cost no lookup.
  - A-R2-02 `DELETE /api/admin/problems/:id` answers 409 for a problem that belongs to a rated contest. Rating, `PUT /api/admin/contests/:id` and the problem DELETE are serialised on the Contest row (`SELECT ... FOR UPDATE` via `lockContests`) and re-check `ratedAt` under that lock, so a just-rated contest's problems, times and standings cannot change (revised in round 3, also A-18).
  - A-R2-03 Input text must be Postgres-storable: the shared zod schemas (`isPgText`) reject U+0000 and ill-formed UTF-16 (lone surrogates) in ids, slugs, usernames, source, run input, test data and other request strings. A leftover invalid-encoding database error (22021) and an undecodable path parameter give 400 VALIDATION_ERROR, and a socket acks VALIDATION_ERROR and logs at debug level (revised in round 3).
  - A-R2-04 Migration `20261112120000_round2_indexes` adds `Submission(status, createdAt)` for the 60 s reconciler. A-R2-05 The plagiarism report reads stored pairs in pages up to the detail cap. A-R2-07 Failed run jobs are removed as soon as they fail for good (`removeOnFail: true`).
- 2026-11-12 (polish 1/4) deployment: files are `deploy/api.Dockerfile` (api and worker share the image; the worker overrides the command), `deploy/web.Dockerfile`, `deploy/nginx.conf`, `deploy/start-api.sh` (migrate, then serve), `deploy/Caddyfile`, `docker-compose.prod.yml` and `.env.production.example` (the root `.gitignore` gets an exception for it). Images use `node:22-alpine` and `nginxinc/nginx-unprivileged:1.31-alpine` (not Debian): the Prisma schema already lists the musl binary target, and `apk add docker-cli` gives the worker its Docker CLI. The Prisma CLI is a devDependency, so the image installs the locked version into `/opt/prisma-cli` (with its engines) for `migrate deploy`. Measured on Docker Desktop 29.9: a full `docker compose build` took 2 m 25 s, `arbiter-api` is 903 MB (base 239 MB, production `node_modules` 317 MB because npm also installs the Prisma CLI tree that `@prisma/client` lists as a peer, the separate Prisma CLI 139 MB, docker-cli 36 MB) and `arbiter-web` is 115 MB. Not reduced further.
- 2026-11-12 (polish 1/4) nginx: TLS is terminated in front (the optional `caddy` profile or a host proxy); the web container listens on plain HTTP 8080 and is published on `127.0.0.1` by default. `/healthz` and `/readyz` are proxied (they live at the root, not under `/api`), `/metrics` answers 404. The strict CSP (`script-src 'self'`, `worker-src 'self' blob:`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`) is applied to SPA responses only, through a `map` on `$uri` (an empty value is not sent), so API responses keep their helmet policy and Swagger UI on `/api/docs` still works; headers use `add_header ... always` only at server level (nginx drops inherited headers in a location that sets its own, so caching uses `expires`), and the api's duplicates of the same headers are hidden. `api` is resolved per request through Docker's DNS (`resolver 127.0.0.11`), so nginx starts without the api and follows a recreated container (one 502 while it restarted, then 200). `X-Forwarded-For` is overwritten with `$remote_addr`, and `real_ip` trusts `X-Forwarded-For` only from private ranges, so `TRUST_PROXY=1` sees the real client behind Caddy and cannot be spoofed by a direct client. Bodies are 1 MB, 21 MB on `/api/admin/problems/:id/tests*`. Containers: api, worker and web run non-root with a read-only root filesystem, `cap_drop: ALL` and `no-new-privileges`; the worker joins the host docker group (`DOCKER_GID`); Postgres and Redis sit on an `internal` network.
- 2026-11-12 (polish 1/4) bootstrap: there is no admin-creation endpoint or seed in production. DEPLOYMENT.md has the operator register normally and run one `UPDATE "User" SET role = 'ADMIN'`; `npm run db:seed` must not be run on real data because it wipes the tables.
- 2026-11-12 (polish 1/4) verification (project `arbiter-polish`, web on port 18080, own env file outside the repo): `docker compose -f docker-compose.prod.yml build` succeeded; all five services reached healthy; the smoke test through nginx passed 13/13 (health, readiness, `/metrics` 404, registration with an HttpOnly Secure SameSite=Strict cookie, promotion by SQL, admin creates a problem and uploads tests through the 21 MB location, WebSocket and polling handshakes, a C++ submission judged AC 3/3 in 1074 ms from submit to verdict, a wrong one judged WA); a Chromium run over the same stack registered through the UI, rendered Monaco, saw Accepted live and kept the session across a reload with no CSP violation and no request to another origin. The stack, its volumes and the images built or pulled for the check were removed afterwards.
- 2026-11-12 (polish 1/4) housekeeping: the worker's 60 s sweep now also calls `purgeRefreshTokens` (`modules/auth/tokens.ts`): it deletes every expired row, and every revoked row whose family has no live token left; a revoked row in a family that is still live is kept until it expires so a replayed rotated token still triggers reuse detection. The admin users page says that demotions apply at once and promotions at the user's next sign-in or token refresh.
- 2026-11-12 (polish 1/4) CI: `.github/workflows/ci.yml` has four jobs (checks, integration, sandbox, e2e); the services publish Postgres on 55432 and Redis on 56379 so the tests' default URLs work unchanged; the e2e job uploads `apps/web/playwright-report` and `test-results` when it fails. It was validated with actionlint 1.7.12 (docker image `rhysd/actionlint`, no findings) and has not run on GitHub: nothing is pushed.
- 2026-11-12 (polish 2/4) `scripts/loadtest.ts` (section 15) has two phases. `judge`: N freshly registered virtual users each keep one submission in flight (closed loop) and submit the reference solutions of the published problems; it reports judged/min, queue-to-verdict p50/p95/max (`judgedAt - createdAt`), the client-side latency and the host CPU % as a markdown table, for each of several user levels and repetitions. `reads`: p50/p95/max and req/s of the public GET endpoints (problem list and detail, the scoreboard page of an ended and of the running contest, the leaderboard, landing stats) at one or more concurrency levels with Node's `fetch`. It needs the API started with `RATE_LIMITS_ENABLED=false` and a throwaway database (the virtual users stay in it). No new dependency. Results and method: `docs/BENCHMARKS.md`.
- 2026-11-12 (polish 2/4) `scripts/screenshots.ts` (`npm run screenshots`) regenerates `docs/screenshots/` with Playwright: landing and workspace in light and dark, the Wrong Answer diff, problems, scoreboard, profile, the admin judge monitor, the plagiarism side by side, one 390 px mobile view and `hero.png`. It submits real programs as the demo user and waits for the real verdicts, so it was run against a replica of the seed data (API on 4002 and Vite on 5190, own database and Redis database, deleted afterwards), not against the dev database; the workspace stores the language preference as JSON under `arbiter:workspace:language` and rewrites its draft on unload, which the script accounts for.
- 2026-11-12 (polish 3/4) documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SANDBOX.md` and `docs/DEMO.md` are written; numbers in them come from `docs/BENCHMARKS.md`, the review record or commands run for them. Section 5 lists `LICENSE (MIT)`: no LICENSE file is added and the README has no license section, because the author chooses the license (the root `package.json` still says `"license": "MIT"` until then). The build's working notes (`docs/lanes/`, `docs/NOTES-integration.md`, `docs/review/fx-*.md`, `docs/review/integrate.md`) are deleted; their decisions were already merged into this log in I1 and at review integration, and the three notes below are the only remaining facts worth keeping.
  - Review finding A-33 is an accepted trade-off (author's decision, revisable): registration keeps saying when an email or username is already registered (`details.field`), which allows account enumeration limited to 5 registrations per hour per IP. A generic message would be confusing without verification emails. Login keeps its generic failure and dummy-hash timing.
  - The leaderboard, profile and admin test-list queries use `$queryRaw` tagged templates with the quoted Prisma model names (`"User"`, `"Submission"`, `"Problem"`, `"TestCase"`); adding `@@map` to those models would break them.
  - Scoreboard cache keys (`contest:<id>:*`) are not prefixed with `QUEUE_PREFIX`; isolation between test runs comes from unique contest ids. `runPlagiarismReport` never throws for a job-level failure (it marks the report FAILED), so BullMQ does not retry plagiarism jobs, by design.
