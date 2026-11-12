# Arbiter sandbox

One throwaway Docker container per judge job (spec section 8). The worker
(`apps/api/src/judge/sandbox.ts`) starts it with the Docker CLI and an args array, and drives
`harness.py` over JSON lines on stdin/stdout. **Expected outputs never enter the container**:
the worker compares outputs itself.

## Build

```sh
npm run sandbox:build          # docker build -t arbiter-sandbox:latest sandbox
```

The image is `debian:bookworm-slim` (pinned by digest) with g++ 12, Python 3.11, OpenJDK 17
(headless JDK) and Node.js 18 from bookworm. The build fails if any of these majors drifts. A user
`runner` (uid/gid 10001) has no home and no login shell. The harness is root-owned with mode 0644
at `/judge/harness.py`, and `/work` has mode 1777.

## Container

```
docker run --rm -i --init --pull never
  --name arbiter-sbx-<jobId>-<rand6> --label arbiter.sandbox=1
  --label arbiter.prefix=<QUEUE_PREFIX> --label arbiter.worker=<workerId>
  --network none --read-only
  --tmpfs /work:rw,exec,nosuid,size=128m --tmpfs /tmp:rw,nosuid,size=32m
  --memory <M>m --memory-swap <M>m --cpus 1 --pids-limit 128
  --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add KILL
  --security-opt no-new-privileges --ulimit core=0 --ulimit nofile=256:256
  [--runtime $SANDBOX_RUNTIME] $SANDBOX_IMAGE
```

`M = memoryLimitMb + language overhead + 256`, capped at 2048. tini is PID 1 (`--init`), and the
harness runs as its child, as root with almost no capabilities. The worker kills the container
after an overall deadline: compile 20 s + the sum of (wall + 1 s) + 10 s, plus 60 s for the
start.

## Harness

- It writes the source to `/work/<file>` (mode 0644). Compile and run happen as `runner`, with
  cwd `/work` and a fresh session (`start_new_session`) per test.
- Each child sets `oom_score_adj` to 1000, drops to 10001:10001 with no supplementary groups,
  and sets `RLIMIT_CPU` = ceil(cpu/1000)+1 s, `FSIZE` 16 MB, `CORE` 0, `NOFILE` 128, `STACK`
  unlimited, and `AS` = memory + 64 MB for C++ only.
- Stdout is capped at 8 MB (OLE kills the group). Stderr keeps its last 2 KB. A wall timer kills
  the process group. Rusage comes from `wait4`. After every test, every remaining runner process
  is killed (including setsid escapes), so nothing survives into the next test.
- Raw status, checked in this order: OLE, then MLE (rss over the limit; SIGKILL near the cgroup
  limit; an OOM message in stderr; Java exit code 3), then TLE (cpu, wall or SIGXCPU), then RE,
  then OK. The worker re-derives the status from the reported facts (`judge/verdict.ts`).

Protocol:

- worker to harness: `init`, `run`, `exit`;
- harness to worker: `ready` (with the harness pid), `compiled`, `result`, `error`.

Byte payloads are base64. Program output can never be mistaken for a protocol line, because only
the harness writes fd 1.

## Tests

`npm run test:sandbox` (real Docker, Postgres and Redis) runs `apps/api/test/sandbox/**` and
`processor.test.ts`. It covers:

- for each language: AC, WA, CE, RE, TLE and MLE;
- the attack list of spec 8.7: fork bomb, `sleep 100`, 100 MB of output, a network connect,
  writes to `/etc` and to the harness, `kill -9` of the harness and `kill -9 -1`, `/proc` reads
  of the harness, and a forged protocol line;
- CRLF and BOM source;
- the janitor;
- no leftover containers afterwards.

## Measured (2026-11-08, Docker Desktop 29.9 on WSL2, i7-1195G7, busy shared laptop)

| | median |
|---|---|
| Container start (spawn to `ready`) | about 2.7 s (n=5 per language) |
| `runTest` round trip, C++ echo program | 21 ms (the program's own wall time is 5 ms, so about 16 ms of overhead) |
| `runTest` round trip, Python echo program | 88 ms (the program's own wall time is 43 ms, interpreter start included, so about 45 ms of overhead) |

The start time was measured on Docker Desktop only, where containers run in a Linux VM. A native
Linux Docker host is likely faster, but that was not measured here.
