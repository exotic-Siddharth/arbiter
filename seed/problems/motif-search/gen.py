"""Hidden tests for motif-search. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 200000


def write(number, t, p):
    assert 1 <= len(p) <= len(t) <= MAX_N
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{t}\n{p}\n")


def rand_str(rng, length, alphabet):
    return "".join(rng.choice(alphabet) for _ in range(length))


def main():
    rng = random.Random(14141108)
    # 03: one bead that matches.
    write(3, "Q", "Q")
    # 04: one bead that does not match.
    write(4, "Q", "Z")
    # 05: m = n: the motif is a rotation of the necklace in one place, reversed in another.
    base = rand_str(rng, 50000, "AB")
    write(5, base + base[::-1], (base + base[::-1])[777:] + (base + base[::-1])[:777])
    # 06: max n, a single letter everywhere: every bead is a motif start.
    write(6, "A" * MAX_N, "A" * 1000)
    # 07: max n, a run of one letter and a motif that fails only at its last letter
    #     (the largest input, worst for a letter-by-letter scan).
    write(7, "A" * MAX_N, "A" * (MAX_N - 2) + "B")
    # 08: max n, random DNA letters, short motif: many matches in both directions.
    t = rand_str(rng, MAX_N, "ACGT")
    write(8, t, t[1234:1239])
    # 09: max n, periodic necklace; only the reversed motif occurs.
    t = ("ABC" * (MAX_N // 3 + 1))[:MAX_N - MAX_N % 3]
    write(9, t, "ACB" * 1000)
    # 10: palindromic motif on a random necklace over two letters.
    t = rand_str(rng, MAX_N // 2, "AB")
    half = rand_str(rng, 6, "AB")
    write(10, t, half + half[::-1])
    # 11: the only occurrence wraps around the clasp.
    p = rand_str(rng, 50000, "XYZ")
    filler = rand_str(rng, MAX_N - 50000 - 10, "ABC")
    write(11, p[30000:] + filler + "QQQQQQQQQQ" + p[:30000], p)
    # 12: small tricky case: overlapping occurrences, both directions, wrap-around.
    write(12, "ABABABAB", "BAB")
    # 13: max n, a Fibonacci word (many long borders), motif is a long prefix of it.
    a, b = "A", "AB"
    while len(b) < MAX_N:
        a, b = b, b + a
    t = b[:MAX_N]
    write(13, t, t[:10946])


main()
