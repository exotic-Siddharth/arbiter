"""Hidden tests for postage-ways. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 60
MAX_Q = 100000
MAX_V = 100000
MAX_P = 50000


def write(number, values, kinds, queries):
    assert 1 <= len(values) <= MAX_N and len(kinds) == len(values) and set(kinds) <= {"R", "C"}
    assert all(1 <= v <= MAX_V for v in values) and 1 <= len(queries) <= MAX_Q
    assert all(0 <= p <= MAX_P for p in queries)
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{len(values)} {len(queries)}\n" + " ".join(map(str, values)) + "\n" + kinds + "\n"
                + " ".join(map(str, queries)) + "\n")


def kinds_of(rng, n, share_c):
    return "".join("C" if rng.random() < share_c else "R" for _ in range(n))


def main():
    rng = random.Random(1000000007)
    # 03: a single regular 1-pence design: exactly one way for every postage.
    write(3, [1], "R", list(range(11)))
    # 04: a single commemorative 1-pence design: P = 2 is impossible.
    write(4, [1], "C", [0, 1, 2])
    # 05: max size, random values and kinds, random queries (the largest input).
    write(5, [rng.randint(1, 1000) for _ in range(MAX_N)], kinds_of(rng, MAX_N, 0.4),
          [rng.randint(10000, MAX_P) for _ in range(MAX_Q)])
    # 06: 60 different regular 1-pence designs: C(P + 59, 59) ways, far beyond the modulus.
    write(6, [1] * MAX_N, "R" * MAX_N, [rng.randint(0, MAX_P) for _ in range(MAX_Q)])
    # 07: commemorative designs 1..60: partitions into distinct parts of at most 60.
    write(7, list(range(1, MAX_N + 1)), "C" * MAX_N, [rng.randint(0, 1830) for _ in range(MAX_Q)])
    # 08: some designs cost more than any postage asked for.
    values = [rng.randint(1, 300) for _ in range(30)] + [rng.randint(MAX_P + 1, MAX_V) for _ in range(30)]
    rng.shuffle(values)
    write(8, values, kinds_of(rng, MAX_N, 0.5), [MAX_P - rng.randint(0, 50) for _ in range(MAX_Q)])
    # 09: only even values, odd postage: no way at all (and P = 0 still has one).
    write(9, [2 * rng.randint(1, 500) for _ in range(MAX_N)], kinds_of(rng, MAX_N, 0.5),
          [2 * rng.randint(0, MAX_P // 2 - 1) + 1 for _ in range(MAX_Q - 1)] + [0])
    # 10: medium random case.
    write(10, [rng.randint(1, 50) for _ in range(20)], kinds_of(rng, 20, 0.5), [rng.randint(0, 2000) for _ in range(500)])
    # 11: many duplicate small values of both kinds, every query at the maximum.
    write(11, [rng.randint(1, 10) for _ in range(MAX_N)], kinds_of(rng, MAX_N, 0.5), [MAX_P] * MAX_Q)
    # 12: only P = 0 is asked.
    write(12, [rng.randint(1, MAX_V) for _ in range(MAX_N)], kinds_of(rng, MAX_N, 0.5), [0] * 1000)
    # 13: commemorative 1-pence designs next to regular large ones; queries cover every
    # postage up to 5000.
    values = [1] * 30 + [rng.randint(100, 900) for _ in range(30)]
    write(13, values, "C" * 30 + "R" * 30, list(range(5001)))


main()
