"""Hidden tests for rising-towers. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 100000
MAX_H = 10**9


def write(number, d, heights):
    text = f"{len(heights)} {d}\n" + " ".join(map(str, heights)) + "\n"
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(text)


def main():
    rng = random.Random(9091108)
    # 03: a single tower.
    write(3, 7, [5])
    # 04: max n, all equal, d = 0: every tower extends the staircase.
    write(4, 0, [777] * MAX_N)
    # 05: max n, all equal, d = 1: no two towers can be combined.
    write(5, 1, [777] * MAX_N)
    # 06: max n, rising by exactly d each time (the boundary rise is allowed).
    write(6, 9000, [1 + 9000 * i for i in range(MAX_N)])
    # 07: max n, rising by d - 1 each time with d = 3: every other tower can be picked.
    write(7, 3, [1 + 2 * i for i in range(MAX_N)])
    # 08: max n, strictly decreasing.
    write(8, 0, [MAX_H - i for i in range(MAX_N)])
    # 09: max n, d = 10^9 is larger than any possible rise.
    write(9, MAX_H, [rng.randint(1, MAX_H) for _ in range(MAX_N)])
    # 10: small random with many ties, d = 0 and small heights.
    write(10, 0, [rng.randint(1, 10) for _ in range(2000)])
    # 11: rising trend with noise, small d.
    write(11, 2, [i * 3 + rng.randint(0, 40) for i in range(1, 30001)])
    # 12: max n, uniform random heights up to 10^9, moderate d (the largest input).
    write(12, 1000, [rng.randint(1, MAX_H) for _ in range(MAX_N)])
    # 13: max n, d = 0, heights 1..10: long non-decreasing staircases.
    write(13, 0, [rng.randint(1, 10) for _ in range(MAX_N)])


main()
