# Two-minute demo

A script for showing Arbiter live on the development stack with the seed data. Times are a guide; the
order matters more than the clock.

## Before you start

- The stack is running (`npm run dev`, see the [README](../README.md#quick-start)), the judge image is
  built (`npm run sandbox:build`) and the database is freshly seeded (`npm run db:seed`). The seeded
  "Weekly Practice Arena" stays live for 14 days after seeding.
- Open `http://localhost:5173` in a browser, signed out, dark theme.
- Keep `seed/problems/rainfall-ledger/ref.cpp` open in an editor, ready to copy.
- Accounts (development seed only): `demo` / `demo12345` (also the "Try the demo" button) and
  `admin` / `admin12345`.
- `POST /api/submissions` allows 6 submissions per minute per user; this script uses 2.

## Script

| Time | Do | Say |
| --- | --- | --- |
| 0:00 | Show the landing page: stats row, "Judged just now" feed, the sandbox card further down. | "Arbiter is an online judge with live contests. Untrusted code in four languages runs in a throwaway Docker container per submission, and verdicts stream back test by test." |
| 0:10 | Click **Try the demo**. The problem list opens. | "One click signs in as a shared demo account. The list filters by difficulty, tag and solved status." |
| 0:20 | Open **Rainfall Ledger**. Pick **C++17 (g++)**, paste `ref.cpp` into the editor, press **Submit** (Ctrl+Enter). | "The API stores the submission and puts a job on a Redis queue, then answers 202 at once. A worker picks it up and starts a container with no network, a read-only file system, a memory cap and a process limit." |
| 0:30 | Watch the Result tab: Queued, Compiling, then test chips 1 to 12 turn green, then **Accepted** with time and memory. | "Each chip is a Socket.IO event from the worker, relayed through Redis to the API. The expected outputs never enter the container: the worker compares the output itself." |
| 0:45 | Switch the language to **Python 3.11**, replace the code with the three lines below, press **Submit**. | "Now a wrong answer." |
| 0:55 | The verdict is **Wrong Answer** on test 1. Scroll to "Failed on sample 1": input, expected and actual output. | "Judging stops at the first failing test. For a sample test the user sees the diff; hidden tests never show their data." |
| 1:05 | Go to **Contests**, open **Weekly Practice Arena**, then its **Scoreboard** tab. | "A live ICPC scoreboard: solved count, then penalty minutes. It is cached in Redis as a sorted set and rebuilt from Postgres if the cache is missing. Rows update for everyone watching when a contest submission is judged." |
| 1:20 | Open the user menu, sign out, sign in as `admin`. Open the user menu again and choose **Admin**. | "Admins write problems, upload tests, validate the reference solution and run contests." |
| 1:30 | The **Judge monitor**: queue counts, workers with their last heartbeat, latency p50 and p95, throughput per minute. | "This reads BullMQ's queue counts and the workers' Redis heartbeats; it refreshes every 5 seconds." |
| 1:40 | Open **Plagiarism**, the report for **Arbiter Round #1**, then the top pair. | "Winnowing, as in MOSS: identifiers are normalised, so renaming variables does not hide a copy. The seed plants two copied pairs; both are found, with the matched lines highlighted." |
| 1:55 | Close. | "There are unit, integration, real-Docker sandbox and Playwright tests, a code-review record and measured benchmarks in the docs." |

The wrong program for step 0:45:

```python
import sys
sys.stdin.read()
print("0 0")
```

## If something goes wrong

- The verdict stays at Queued: the worker is not running or cannot reach Docker. The admin Judge
  monitor shows no workers in that case. Start Docker Desktop and restart `npm run dev`.
- "Sandbox image ... is not available": run `npm run sandbox:build`.
- The Weekly Practice Arena shows as ended: more than 14 days have passed since seeding; run
  `npm run db:seed` again.

## After the demo

The demo user now owns two more submissions. `npm run db:seed` restores the seed data (it wipes and
recreates every application table, so never run it against real data).
