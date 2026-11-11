"""Hidden tests for tandem-kayaks. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 100000
MAX_W = 1000000
MAX_C = 2000000


def write(number, cap, weights):
    assert 1 <= len(weights) <= MAX_N and 1 <= cap <= MAX_C and all(1 <= w <= MAX_W for w in weights)
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{len(weights)} {cap}\n" + " ".join(map(str, weights)) + "\n")


def main():
    rng = random.Random(881)
    # 03: a single member: no pair at all.
    write(3, MAX_C, [MAX_W])
    # 04: two members whose sum is exactly C (still safe).
    write(4, 150, [70, 80])
    # 05: max n, random weights and a mid-range rating.
    write(5, 1000000, [rng.randint(1, MAX_W) for _ in range(MAX_N)])
    # 06: max n, everyone weighs the same and C is exactly twice that: every pair is safe
    # and sums to C (n(n-1)/2 pairs, beyond 32 bits).
    write(6, 1000000, [500000] * MAX_N)
    # 07: max n, heaviest members and the largest rating: every pair is safe.
    write(7, MAX_C, [rng.randint(900000, MAX_W) for _ in range(MAX_N)])
    # 08: max n, nobody can share a boat.
    write(8, 1000001, [rng.randint(500001, MAX_W) for _ in range(MAX_N)])
    # 09: max n, C equals the sum of a random existing pair, so the best sum is exactly C.
    weights = [rng.randint(1, MAX_W) for _ in range(MAX_N)]
    write(9, weights[17] + weights[4242], weights)
    # 10: medium random case.
    write(10, rng.randint(1000, 2000), [rng.randint(1, 1500) for _ in range(1000)])
    # 11: max n, few distinct weights, rating hitting several duplicate sums exactly.
    write(11, 60, [rng.choice((10, 20, 30, 40, 50)) for _ in range(MAX_N)])
    # 12: two members who do not fit together.
    write(12, 1, [1, 1])
    # 13: max n, a small rating: only a few light members can pair.
    weights = [rng.randint(1000, MAX_W) for _ in range(MAX_N)]
    for i in rng.sample(range(MAX_N), 30):
        weights[i] = rng.randint(1, 600)
    write(13, 1000, weights)


main()
