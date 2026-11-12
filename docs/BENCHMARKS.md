# Benchmarks

Measured on 2026-11-12 with `npm run loadtest` (spec section 15) and `npm run judge:refs`. Every number
below comes from runs made for this document; nothing is carried over from earlier notes except the
integration figures in the comparison section, which are labelled as such.

These are numbers from one shared laptop, not a capacity claim for a server. Read the caveats at the end.

## Machine and software

| item | value |
|---|---|
| CPU | Intel Core i7-1195G7 (11th gen), 4 cores / 8 threads, 2.9 GHz base |
| RAM | 32 GB (31.7 GiB reported by Windows) |
| OS | Windows 11 Home, build 26300, on AC power |
| Docker | Docker Desktop, engine 29.9.2 (linux/amd64), WSL2 backend, kernel 6.6.87.2-microsoft-standard-WSL2; the engine sees 8 CPUs and 15.5 GiB |
| Node / npm | 22.12.0 / 10.9.0 (host); the load-test client runs on the host with Node's built-in `fetch` |
| Postgres / Redis | `postgres:16-alpine`, `redis:7-alpine` (the dev compose containers, shared with the dev stack) |
| Judge image | `arbiter-sandbox:latest`: g++ 12.2.0, Python 3.11.2, OpenJDK 17.0.21, Node 18.20.4 |
| Worker setting | `JUDGE_CONCURRENCY=2` (the default and the value in `apps/api/.env`): at most 2 sandbox containers at once |
| Repo | built from `9a62bbc` plus the load-test and screenshot scripts of this change |

The machine is shared with another user session that may run ML jobs. Nothing else was started on purpose
during the runs, and the host CPU load is reported for each run (see "Background load").

## Setup

The API and the worker ran from the production build (`npm run build`, then `node dist/index.js` and
`node dist/worker.js` in `apps/api`) so that tsx and the Vite dev server do not take CPU. They used a
separate database `arbiter_bench` (the seeded dev data: 8 published problems, the seeded contests and users), Redis database 7 with its own queue prefix, API port 4002 and
`RATE_LIMITS_ENABLED=false`, so the dev stack on 4000 and its data were not touched. The database and the
Redis keys were deleted afterwards.

```
DATABASE_URL=postgresql://arbiter:arbiter@localhost:55432/arbiter_bench?schema=public
REDIS_URL=redis://localhost:56379/7   QUEUE_PREFIX=arbiter-bench
RATE_LIMITS_ENABLED=false   API_PORT=4002   LOG_LEVEL=warn   WORKER_METRICS_PORT=9466
```

## Method

Each run starts from an idle queue. The commands were run from the repository root:

```
# judging: 2, 4 and 8 virtual users, 6 submissions each per run, 3 runs per level, 2 warm-up submissions
npm run loadtest -- --api=http://localhost:4002 --phase=judge --users=2,4,8 --per-user=6 --repeat=3 --warmup=2

# read latency: 400 GETs per run, 1 and 8 concurrent clients, 50 warm-up requests, 3 runs per row
npm run loadtest -- --api=http://localhost:4002 --phase=reads --read-requests=400 --read-concurrency=1,8 --read-warmup=50 --read-repeat=3

# integration comparison: all 46 reference programs, 2 in flight, 3 repetitions
npm run judge:refs -- --api=http://localhost:4002 --inflight=2
```

Judging phase (`scripts/loadtest.ts`): every virtual user is a freshly registered account that keeps one
submission in flight (closed loop: POST `/api/submissions`, poll `GET /api/submissions/:id` every 250 ms
until DONE, repeat). The programs are the reference solutions (`ref.cpp`, `ref.py`) of the 8 published
problems, 16 programs in a fixed order, so each run is repeatable and every submission must come back
Accepted (the `non-AC` column counts the others). Two warm-up submissions per language are judged first and
not counted (image layers, page cache, Prisma and BullMQ connections). Reported per run:

- judged/min: submissions divided by the wall minutes of the run;
- p50, p95, max queue-to-verdict: `judgedAt - createdAt` as the server stored it (API insert to worker
  update); nearest-rank percentiles;
- client p50/p95: what the virtual user saw, from the POST being sent to the verdict first seen by polling
  (about 0.1 to 0.2 s above the server figure: the 250 ms polling grid and HTTP);
- CPU %: busy share of all 8 logical CPUs of the host during the run (Node `os.cpus()` tick deltas, which
  include the Docker VM's threads).

The table rows are the three runs; the bold row is the median of the runs, with the range in brackets.
Each run of a level uses 6 programs per user taken in sequence from the 16-program pool, so the 2, 4 and 8
user levels do not judge the same programs.

Read phase: unauthenticated GETs against the production-built API with Node's built-in `fetch` (keep-alive,
no extra dependency), the response body fully read. Latency is per request; req/s is requests divided by the
run's wall time. The rows are medians over the 3 runs with the range in brackets.

## Results: judging

Queue-to-verdict at `JUDGE_CONCURRENCY=2`, 6 submissions per user per run (12, 24 and 48 submissions per
run). All 252 judged submissions (3 runs of each level) were Accepted: 0 non-AC in every run.

| users | run | submissions | wall s | judged/min | p50 s | p95 s | max s | client p50 s | client p95 s | non-AC | CPU % |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 1 | 12 | 15.7 | 45.9 | 2.31 | 3.26 | 3.26 | 2.48 | 3.35 | 0 | 61 |
| 2 | 2 | 12 | 16.5 | 43.7 | 2.65 | 3.61 | 3.61 | 2.78 | 3.82 | 0 | 62 |
| 2 | 3 | 12 | 18.0 | 40.1 | 3.06 | 4.01 | 4.01 | 3.10 | 4.18 | 0 | 66 |
| **2** | **median (range)** | 12 | 16.5 | 43.7 (40.1 to 45.9) | 2.65 (2.31 to 3.06) | 3.61 (3.26 to 4.01) | 3.61 | 2.78 | 3.82 | 0 | 62 |
| 4 | 1 | 24 | 33.3 | 43.3 | 5.33 | 6.58 | 6.88 | 5.46 | 6.63 | 0 | 64 |
| 4 | 2 | 24 | 33.6 | 42.8 | 4.98 | 6.86 | 6.89 | 5.25 | 6.89 | 0 | 67 |
| 4 | 3 | 24 | 34.0 | 42.4 | 5.28 | 6.83 | 7.04 | 5.47 | 7.09 | 0 | 64 |
| **4** | **median (range)** | 24 | 33.6 | 42.8 (42.4 to 43.3) | 5.28 (4.98 to 5.33) | 6.83 (6.58 to 6.86) | 6.89 | 5.46 | 6.89 | 0 | 64 |
| 8 | 1 | 48 | 71.6 | 40.2 | 11.32 | 13.52 | 15.07 | 11.56 | 13.82 | 0 | 70 |
| 8 | 2 | 48 | 71.1 | 40.5 | 11.25 | 12.99 | 13.17 | 11.39 | 13.19 | 0 | 68 |
| 8 | 3 | 48 | 69.3 | 41.6 | 10.94 | 12.68 | 13.03 | 11.01 | 12.91 | 0 | 66 |
| **8** | **median (range)** | 48 | 71.1 | 40.5 (40.2 to 41.6) | 11.25 (10.94 to 11.32) | 12.99 (12.68 to 13.52) | 13.17 | 11.39 | 13.19 | 0 | 68 |

By language (median over the runs of each run's p50 and p95, seconds, queue-to-verdict):

| users | language | p50 s | p95 s |
|---:|---|---:|---:|
| 2 | C++ | 3.08 | 3.61 |
| 2 | Python | 1.84 | 3.12 |
| 4 | C++ | 5.77 | 6.89 |
| 4 | Python | 4.61 | 6.00 |
| 8 | C++ | 11.91 | 13.16 |
| 8 | Python | 10.57 | 12.78 |

How to read it. Throughput is flat at about 40 to 46 submissions/min whatever the number of users, while
latency grows in proportion to the users: the judge is saturated by the two worker slots, and the extra
virtual users only wait in the BullMQ queue. The arithmetic matches: 2 slots x 60 s / 43 per min is about
2.8 s of slot time per submission, and 8 users / 2 slots x 2.8 s is about 11 s, the measured p50. So the
2-user row (2.65 s median) is the figure for an unqueued submission, and the 4 and 8 user rows measure
waiting for a slot, not slower judging. With `JUDGE_CONCURRENCY` raised the ceiling would move, but I did
not measure that: the laptop has 4 cores and each sandbox is limited to 1 CPU.

## Results: read latency

Production-built API, seeded data (the problem list has 8 problems; the ended contest scoreboard has 26
rows, the running one 10; the leaderboard has 32 users, of which 20 are returned).
Median over 3 runs of 400 requests each, range in brackets. 0 errors in every row.

| endpoint | response bytes | concurrency | p50 ms | p95 ms | max ms | req/s | CPU % |
|---|---:|---:|---:|---:|---:|---:|---:|
| problem list (page size 20) | 1670 | 1 | 6.5 (6.1 to 7.6) | 9.7 (8.1 to 9.9) | 13.6 | 145 (130 to 157) | 43 |
| problem detail (rainfall-ledger) | 2332 | 1 | 6.3 (6.1 to 6.6) | 8.5 (7.6 to 8.7) | 18.4 | 153 (148 to 162) | 38 |
| scoreboard page (ended contest, page size 50) | 14230 | 1 | 9.1 (8.7 to 9.2) | 11.7 (10.4 to 11.7) | 16.1 | 107 (106 to 115) | 37 |
| scoreboard page (running contest, page size 50) | 4669 | 1 | 8.5 (8.4 to 8.8) | 10.7 (10.3 to 12.2) | 21.5 | 116 (110 to 118) | 37 |
| leaderboard by rating (page size 20) | 1237 | 1 | 5.3 (4.8 to 6.1) | 7.5 (6.1 to 7.9) | 10.0 | 183 (160 to 205) | 45 |
| landing stats | 81 | 1 | 3.8 (3.5 to 3.9) | 5.6 (4.9 to 6.0) | 10.5 | 250 (241 to 277) | 59 |
| problem list (page size 20) | 1670 | 8 | 19.2 (18.2 to 21.3) | 29.9 (24.1 to 32.1) | 48.0 | 375 (351 to 428) | 88 |
| problem detail (rainfall-ledger) | 2332 | 8 | 13.3 (12.4 to 14.0) | 17.2 (16.0 to 19.0) | 22.2 | 590 (552 to 630) | 76 |
| scoreboard page (ended contest, page size 50) | 14230 | 8 | 21.7 (21.6 to 22.8) | 32.6 (26.4 to 35.9) | 41.3 | 336 (336 to 363) | 76 |
| scoreboard page (running contest, page size 50) | 4669 | 8 | 27.2 (22.0 to 27.8) | 42.6 (31.3 to 56.9) | 53.0 | 271 (263 to 343) | 89 |
| leaderboard by rating (page size 20) | 1237 | 8 | 12.0 (11.9 to 12.5) | 16.7 (16.4 to 17.2) | 29.3 | 636 (629 to 637) | 82 |
| landing stats | 81 | 8 | 19.0 (17.1 to 21.1) | 29.9 (29.4 to 36.3) | 48.8 | 366 (365 to 423) | 94 |

An earlier pass of the same command on the same stack (before the response-size column and the endpoint
labels were added to the script) gave p50 3.5 to 8.0 ms and p95 4.8 to 9.8 ms at 1 client, p50 10.8 to
20.0 ms and p95 15.6 to 27.4 ms at 8 clients, with 122 to 274 req/s at 1 client and 386 to 705 req/s at 8
(landing stats the fastest and the ended scoreboard the slowest in both passes). The 8-client latencies
moved by up to about 50 % between the two passes (running scoreboard p50 17.9 ms then, 27.2 ms now): treat
the 8-client figures as good to roughly a factor of 1.5, and the 1-client figures as good to about 20 %.
Per the design the scoreboard is kept in Redis and the problem list and detail come from Postgres. At 8
clients the host CPU is 70 to 94 % busy, and the load generator and the API share the same laptop, so the clients
themselves are part of the CPU figure.

## Comparison with the integration measurement

The integration run (`npm run judge:refs --inflight=2`: all 46 reference programs, including the TLE and
WA variants, two in flight) had been measured before this work at queue-to-verdict C++ median 4.1 s / p95
7.6 s and Python 2.6 s / p95 8.3 s. The same command, run three times now:

| run | host CPU % at start to end | C++ (15 programs) median / p95 / max | Python (31 programs) median / p95 / max | wall s | verdicts |
|---:|---|---|---|---:|---|
| 1 | 17 to 17 | 3151 / 4392 / 4392 ms | 2202 / 7860 / 9508 ms | 77.4 | 46 of 46 as expected |
| 2 | 9 to 6 | 3259 / 4239 / 4239 ms | 2395 / 7841 / 9553 ms | 79.3 | 46 of 46 as expected |
| 3 | 7 to 15 | 3477 / 4564 / 4564 ms | 2319 / 7890 / 9346 ms | 79.9 | 46 of 46 as expected |
| median | | 3259 / 4392 ms | 2319 / 7860 ms | 79.3 | |

The plagiarism report through the queue finished DONE with 2 pairs in all three runs. Python p95 is about
7.9 s in every run because the set contains the deliberate TLE programs, which run to the problem's time
limit; that is why the Python p95 is far above its median. Against the integration numbers: C++ median
3.3 s now vs 4.1 s, C++ p95 4.4 s vs 7.6 s, Python median 2.3 s vs 2.6 s, Python p95 7.9 s vs 8.3 s; the
direction is the same and the Python tail agrees. I do not know the background load during the earlier
run, so I do not attribute the lower C++ figures to anything in the code; the three runs here differ among
themselves by about 10 % on the medians. The sanity link to the load test: the 2-user judging run
(unqueued C++ median 3.08 s, Python 1.84 s) is consistent with these medians.

## Background load

PowerShell `(Get-CimInstance Win32_Processor).LoadPercentage` at the start and end of each benchmark, plus
the per-run CPU % columns above:

| benchmark | start | end |
|---|---:|---:|
| judging (2, 4, 8 users, 9 runs) | 4 % | 21 % |
| read latency, final pass (12 rows) | 17 % | 30 % |
| read latency, earlier pass | 11 % | 12 % |
| integration run 1 / 2 / 3 | 17 / 9 / 7 % | 17 / 6 / 15 % |

## Caveats

- One shared Windows laptop, not a server. Another user session shares it and may start ML jobs at any
  time; the start and end loads above are a sample of two instants, not a record of the whole run.
- Docker Desktop runs the sandbox containers in a WSL2 VM, so each `docker run` pays a Windows to VM hop
  and the sandbox CPU limit competes with the host's own processes. A native Linux host is likely faster
  per container; I did not measure one.
- The load generator, API, worker, Postgres, Redis and the sandboxes all run on the same 4 cores, so every
  number includes the generator's own CPU use, and the 8-client read figures in particular are partly a
  measure of that.
- Three runs per cell give a median and a range, not a confidence interval. Differences below about 20 %
  (judging) or 50 % (8-client reads) between two cells should not be read as real.
- The judging workload is 16 reference programs on 8 problems (the C++ ones are compiled inside the
  sandbox). It says nothing about contest-day spikes, long-running programs near the
  time limit, or Java and JavaScript submissions, which this test does not submit.
- The users, submissions and queue history that the runs created lived in the throwaway database and Redis
  database described above and were deleted afterwards. The seeded dev database was not written to by the
  benchmarks.
- `JUDGE_CONCURRENCY` was not varied. The statement that the 2-slot worker is the ceiling is an inference
  from flat throughput and proportional latency, not from a second configuration.

## Screenshots

`npm run screenshots -- --base=http://localhost:5173` regenerates `docs/screenshots/` (Chromium through
Playwright, 1440x900 except the mobile view) against a running, seeded stack. It signs in as the seeded
demo user and the seeded admin, submits the Rainfall Ledger reference (C++, Accepted) and a constant-output
Python program (Wrong Answer), and waits for the real verdicts, so the demo user gains submissions: it
ran against the stack above on the benchmark replica of the seed data, not against the dev database.

| file | what it shows |
|---|---|
| `hero.png` | workspace, dark, Accepted 12 / 12 (README hero; the same frame as `workspace-accepted-dark.png`) |
| `landing-light.png`, `landing-dark.png` | landing page |
| `workspace-accepted-light.png`, `workspace-accepted-dark.png` | workspace with the Accepted verdict |
| `workspace-wrong-answer-dark.png` | Wrong Answer with the failed-sample diff |
| `problems-dark.png`, `scoreboard-dark.png`, `profile-dark.png` | problem list, contest scoreboard, profile |
| `admin-judge-monitor-dark.png`, `plagiarism-side-by-side-dark.png` | admin judge monitor, plagiarism comparison |
| `mobile-submissions-light-390.png` | 390 px wide submissions list (long titles wrap, no truncation) |
