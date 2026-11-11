# Seed problems

Each folder here is one original Arbiter problem. `apps/api/prisma/seed.ts` loads them into the
database (samples become `isSample` test cases with the walkthrough as `explanation`). Two
scripts maintain them:

- `scripts/gen-tests.py` writes the hidden tests and every expected output;
- `scripts/verify-problems.py` validates a folder and runs every program inside Docker.

Both use the Python standard library only and work with any Python 3.9+ on the host.

## Folder protocol

`seed/problems/<slug>/` contains:

| File | Content |
|---|---|
| `problem.md` | An original story in clear English, then the sections `## Input`, `## Output` and `## Constraints` in this order (KaTeX `$...$` for math), and optionally `## Notes` last. No other `##` sections: samples are **not** written in the statement (resolution R9). Every edge case is defined: minimal inputs, ties, output format, modulus, what to print when impossible. |
| `meta.json` | `{"slug", "title", "difficulty", "tags", "timeLimitMs", "memoryLimitMb", "checker", "floatTolerance", "samples": [1, 2]}` (see below). |
| `gen.py` | Hidden-test generator, standard library only, deterministic (fixed seeds). |
| `ref.py`, `ref.cpp` | Reference solutions with the intended complexity and fast I/O. |
| `slow.py` | Optional: correct but asymptotically slower; must TLE on the largest test. |
| `wrong.py` | Optional: a realistic bug; passes both samples, fails at least one hidden test. |
| `tests/` | `01.in`, `02.in` (hand-written samples), `01.md`, `02.md` (walkthroughs of the sample answers), `03.in` .. `NN.in` (generated) and `01.out` .. `NN.out` (written by `ref.py`). |

### meta.json

- `slug`: equals the folder name, lower-case kebab-case.
- `title`: short Title Case, at most 60 characters.
- `difficulty`: `EASY`, `MEDIUM` or `HARD`.
- `tags`: non-empty, distinct, from this vocabulary: `hashing`, `stack`, `prefix-sums`,
  `binary-search`, `two-pointers`, `greedy`, `sorting`, `bfs`, `graphs`, `shortest-paths`, `dp`,
  `lis`, `union-find`, `heap`, `data-structures`, `fenwick-tree`, `segment-tree`, `strings`,
  `string-matching`, `topological-sort`, `math`, `geometry`, `implementation`.
- `timeLimitMs`: integer in [100, 10000], typically 1000-2000. `memoryLimitMb`: integer in [16, 1024], typically 256.
- `checker`: `TOKENS`, `EXACT` or `FLOAT` (spec section 8.6). `floatTolerance` is present only
  for `FLOAT` (in (0, 1), e.g. `1e-6`); a FLOAT pair passes if `|a-b| <= tol` or `|a-b| <= tol*|b|`.
- `samples`: always `[1, 2]`.

### Tests

- 10 to 14 tests in total, the 2 samples included, numbered `01`..`NN` without gaps.
- `gen.py` is run as `python gen.py <tests_dir>` from the problem folder. It writes `03.in` ..
  `NN.in` only and never touches `01` or `02`. It covers edge cases (minimum sizes, all equal,
  extremes, worst cases for naive solutions, impossible cases where relevant) and at least two
  max-size tests near the constraints. Make the largest input (in bytes) the worst case for
  `slow.py`, because that is the test the verifier times it on.
- Every input is at most 1 MiB (1,048,576 bytes), LF newlines only: open files with
  `newline="\n"` or write bytes. Every text file in the folder is LF-only and has no BOM.

### Programs and budgets

The judge gives Python 3x the time limit (spec section 8.5). The verifier measures CPU time
(user + sys of the child process), which stays stable on a busy machine.

| Program | Requirement |
|---|---|
| `ref.py` | Python 3.11 in Docker: output equals `NN.out` byte for byte on every test; CPU <= 1.5 x `timeLimitMs`; peak RSS <= `memoryLimitMb` + 16 MiB. Use `sys.stdin.buffer`. |
| `ref.cpp` | `g++ -std=gnu++17 -O2 -pipe` in Docker: passes the problem's checker on every test; CPU <= 0.5 x `timeLimitMs`. Use `ios::sync_with_stdio(false)`. |
| `slow.py` | Python 3.11: correct on every test it finishes within 6 x `timeLimitMs` (tests run smallest first; after its first timeout only the largest test is still run); on the largest test it must exceed 6 x `timeLimitMs`, twice the judge's 3x Python budget, so the judge reliably gives TLE. |
| `wrong.py` | Python 3.11: AC on both samples, and WA (or RE/TLE) on at least one hidden test. |

Each problem-set lane provides `slow.py` or `wrong.py` for at least 3 of its problems.

## gen-tests.py

```
python scripts/gen-tests.py <slug> [<slug> ...]
python scripts/gen-tests.py --all
python scripts/gen-tests.py --check <slug> [<slug> ...] | --check --all
    [--root DIR]   problems root, default seed/problems
```

For each problem: deletes the generated tests (`03` and up, `.in` and `.out`), runs `gen.py`
into `tests/`, checks the inputs (numbered without gaps, <= 1 MiB, no CR), then runs `ref.py`
on every `NN.in`, samples included, and writes `NN.out` with LF line endings. `gen.py` and
`ref.py` run with the host interpreter, `PYTHONHASHSEED=0`, so a re-run is byte-identical.
`--check` regenerates into a temporary directory and compares with the files on disk byte for
byte; it writes nothing and exits 1 if anything is stale. Exit code 1 on any failure.

## verify-problems.py

```
python scripts/verify-problems.py <slug> [<slug> ...]
python scripts/verify-problems.py --all
    [--root DIR]        problems root, default seed/problems
    [--no-docker]       static checks only
    [--cpp-image IMG]   default arbiter-sandbox:latest if it exists, else gcc:14
    [--py-image IMG]    default arbiter-sandbox:latest if it exists, else python:3.11-slim
```

Needs the Docker CLI on PATH (Git Bash on Windows:
`export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`). Static checks first:
`meta.json` schema, `problem.md` sections, required files, test numbering and count, sample
walkthroughs, input size, LF only. Then one container per problem and language: the sources
and tests are piped in as a tar stream over stdin (no bind mounts, so paths with spaces work),
with `--network none`, and the image's entrypoint is overridden. `ref.cpp`, `ref.py`, `slow.py`
and `wrong.py` are checked as in the table above, and the Python image must report 3.11
(resolution R17). The script prints one table row per problem and exits 1 on any failure:

```
| problem          | tests | static | ref.cpp | ref.py               | slow.py                | wrong.py | result |
|------------------|-------|--------|---------|----------------------|------------------------|----------|--------|
| badge-collisions | 12    | ok     | 72 ms   | 407 ms / 1500, 31 MB | AC x6, TLE 07 >7233 ms | -        | PASS   |
```

`ref.cpp` shows its slowest CPU time; `ref.py` its slowest CPU time against the budget and its
peak memory; `slow.py` the number of tests it solved correctly and its time on the largest
test; `wrong.py` its first failing hidden test and verdict.

## Workflow for a new problem

1. Write `problem.md`, `meta.json`, `tests/01.in`, `tests/02.in`, `tests/01.md`, `tests/02.md`.
2. Write `ref.py`, `ref.cpp`, `gen.py` (and `slow.py` / `wrong.py`).
3. `python scripts/gen-tests.py <slug>`; read the sample outputs and check them by hand
   against the walkthroughs.
4. `python scripts/verify-problems.py <slug>` until the row says PASS.
5. `python scripts/gen-tests.py --check <slug>` confirms the committed tests are reproducible.
