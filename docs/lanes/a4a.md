# Lane A4a: problem-set scripts and problems 1-8

## Progress
- [x] scripts/gen-tests.py (left by the first attempt): reviewed, kept unchanged; works (`--check` included)
- [x] scripts/verify-problems.py written and tested on badge-collisions; negative copies under
      `_build/tmp/arbiter/a4a/neg` were rejected as expected (CR in problem.md, slug mismatch, wrong .out, wrong.py all-AC)
- [x] seed/problems/README.md: folder protocol and both CLIs (interface stable for lane A4b)
- [x] badge-collisions (slow.py), nested-scrolls (wrong.py), rainfall-ledger (slow.py + wrong.py),
      tandem-kayaks (wrong.py), average-pace (FLOAT, wrong.py), lantern-spacing (slow.py),
      flooded-archive (slow.py), postage-ways (wrong.py): each complete and PASS in verify-problems
- [x] lantern-spacing ref/slow checked against exhaustive brute force (400 random cases);
      flooded-archive ref checked against slow.py (150 random grids)
- [x] gate: gen-tests twice on the 8 slugs gives byte-identical files (220 files, same sha256 list)
- [x] gate: final verify-problems on the 8 slugs: 8 of 8 PASS, exit 0 (log: `_build/tmp/arbiter/a4a/verify-final.log`);
      no owned file changed after that run; `gen-tests.py --check` on the 8 slugs reports all up to date
- [x] extra: average-pace and postage-ways also PASS under the A2 image `arbiter-sandbox:a2-build`
      (Python 3.11.2, g++ 12.2) via `--cpp-image/--py-image`
- Lane complete (2026-11-08).

## Integration needs
- seed.ts (integration phase) must load `seed/problems/<slug>/` per seed/problems/README.md: `meta.json`
  fields map 1:1 to Problem (`checker` -> CheckerType, `floatTolerance` only for FLOAT, average-pace uses 1e-6);
  `problem.md` is the statement; `tests/NN.in`/`NN.out` become TestCase rows with `ordinal = NN`;
  `meta.samples` ([1, 2]) set `isSample`, and `tests/0N.md` is the sample's `explanation`. Normalise `\r\n` to `\n` (R9).
- Statements use GitHub tables (nested-scrolls) and KaTeX display math `$$...$$` (average-pace), so the
  statement renderer needs remark-gfm + remark-math + rehype-katex (all installed in apps/web).
- flooded-archive prints the word `FOREVER` as an answer token; TOKENS handles it, no special casing needed.
- Demo/e2e programs available: slow.py (TLE) in badge-collisions, rainfall-ledger, lantern-spacing,
  flooded-archive; wrong.py (WA on a hidden test, AC on both samples) in nested-scrolls, rainfall-ledger,
  tandem-kayaks, average-pace, postage-ways. ref.py / ref.cpp in every folder are AC.
- verify-problems.py ran with gcc:14 (C++) and python:3.11-slim (Python) because `arbiter-sandbox:latest`
  did not exist yet; once lane A2 builds it, re-run `python scripts/verify-problems.py --all` (it picks the
  sandbox image automatically) to confirm the references under the real image (average-pace and
  postage-ways already PASS under `arbiter-sandbox:a2-build`).
- ref.py CPU times were measured on a heavily loaded laptop; the slowest (lantern-spacing ~1.5 s,
  postage-ways ~1.8 s, both 2000 ms limit) stay well under the judge's 3x Python budget (6 s).

## Decisions
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
