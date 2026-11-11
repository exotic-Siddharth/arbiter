# Lane A4b: problems 9-15

## Progress
- [x] rising-towers (slow.py): verify PASS
- [x] bridge-builders (slow.py): verify PASS
- [x] kiln-scheduling (slow.py): verify PASS
- [x] night-ferries (wrong.py): verify PASS
- [x] sensor-ranges (slow.py): verify PASS
- [x] motif-search (slow.py): verify PASS
- [x] assembly-order (wrong.py): verify PASS
- [x] gate: verify-problems on 7 slugs PASS (2026-11-08)
- [x] gate: gen-tests twice byte-identical (sha1 of all tests equal)

Each problem: write problem.md, meta.json, samples + walkthroughs, ref.py, ref.cpp, gen.py, slow/wrong;
then `python scripts/gen-tests.py <slug>` and `python scripts/verify-problems.py <slug>`.
Scratch checks live in `_build/tmp/arbiter/a4b/`.

## Integration needs
- seed.ts must read seed/problems/<slug>/ for the 7 slugs (rising-towers, bridge-builders, kiln-scheduling, night-ferries, sensor-ranges, motif-search, assembly-order): meta.json, problem.md, tests/NN.in/.out, tests/01.md and 02.md as sample explanations. No bugs found in scripts/gen-tests.py or scripts/verify-problems.py.
- assembly-order output on a cycle is two lines (CYCLE s, then the stuck task numbers); the TOKENS checker compares whitespace-separated tokens, so it works unchanged.

## Decisions
- 2026-11-08: assembly-order adds a twist to Kahn: tasks carry distinct part codes and the order minimises the code sequence; on a cycle the output is `CYCLE s` plus the sorted stuck tasks (cycle members and everything downstream).
- 2026-11-08: night-ferries uses periodic departure schedules plus up to K=3 charter tickets, and prints the best arrival for every j in 0..K.
- 2026-11-08: assembly-order limits are n <= 4e4, m <= 5e4 so that the largest input stays under 1 MB.
