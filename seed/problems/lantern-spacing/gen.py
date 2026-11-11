"""Hidden tests for lantern-spacing. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 80000
MAX_X = 10 ** 9


def write(number, k, xs, flags):
    n = len(xs)
    assert 2 <= k <= n <= MAX_N and len(set(xs)) == n and all(0 <= x <= MAX_X for x in xs)
    assert len(flags) == n and set(flags) <= {"0", "1"}
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{n} {k}\n" + " ".join(map(str, xs)) + "\n" + flags + "\n")


def distinct(rng, n, low, high):
    return rng.sample(range(low, high + 1), n)


def flags_with(rng, n, reserved_count):
    chosen = set(rng.sample(range(n), reserved_count))
    return "".join("1" if i in chosen else "0" for i in range(n))


def main():
    rng = random.Random(9090)
    # 03: two hooks, both must be used.
    write(3, 2, [MAX_X, 0], "00")
    # 04: max n, k = n: every hook carries a lantern, the answer is the smallest gap.
    write(4, MAX_N, distinct(rng, MAX_N, 0, MAX_X), flags_with(rng, MAX_N, 500))
    # 05: max n, no reserved hook, k = 1000.
    write(5, 1000, distinct(rng, MAX_N, 0, MAX_X), "0" * MAX_N)
    # 06: max n, exactly k reserved hooks: the reserved set is the whole plan.
    write(6, 300, distinct(rng, MAX_N, 0, MAX_X), flags_with(rng, MAX_N, 300))
    # 07: max n, one reserved hook too many: impossible.
    write(7, 2000, distinct(rng, MAX_N, 0, MAX_X), flags_with(rng, MAX_N, 2001))
    # 08: max n, nine-digit positions, few lanterns: a huge answer (largest input; worst
    # case for scanning the spacing upwards).
    write(8, 40, distinct(rng, MAX_N, 10 ** 8, MAX_X), flags_with(rng, MAX_N, 3))
    # 09: clusters ending in a reserved hook: optional hooks just before a reserved one
    # must be skipped (needs the look-ahead).
    xs, flags, base = [], [], 0
    while len(xs) + 5 <= 20000:
        for off in (0, 3, 6, 9):
            xs.append(base + off)
            flags.append("0")
        xs.append(base + 10)
        flags.append("1")
        base += rng.randint(15, 40)
    write(9, 6000, xs, "".join(flags))
    # 10: medium random with a few reserved hooks.
    n = 2000
    write(10, 150, distinct(rng, n, 0, 10 ** 6), flags_with(rng, n, 20))
    # 11: dense clusters far apart.
    xs = []
    for c in range(200):
        start = c * 4_000_000
        xs += [start + i * rng.randint(1, 3) * 1000 + i for i in range(100)]
    xs = sorted(set(xs))
    write(11, 450, xs, flags_with(rng, len(xs), 50))
    # 12: every hook reserved and k = n.
    xs = distinct(rng, 5000, 0, 10 ** 7)
    write(12, 5000, xs, "1" * 5000)
    # 13: max n, k = n / 2 with many reserved hooks.
    write(13, MAX_N // 2, distinct(rng, MAX_N, 0, MAX_X), flags_with(rng, MAX_N, 10000))


main()
