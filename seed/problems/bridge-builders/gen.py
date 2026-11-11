"""Hidden tests for bridge-builders. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 100000
MAX_M = 80000


def write(number, n, bridges):
    lines = [f"{n} {len(bridges)}"] + [f"{a} {b}" for a, b in bridges]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def main():
    rng = random.Random(10101108)
    # 03: the smallest archipelago.
    write(3, 2, [(2, 1)])
    # 04: two islands, the same bridge over and over: everything after day 1 is wasted.
    write(4, 2, [(1, 2) if i % 2 == 0 else (2, 1) for i in range(MAX_M)])
    # 05: a path built in order 1-2, 2-3, ...: long chains for a union-find without balancing.
    write(5, MAX_M + 1, [(i, i + 1) for i in range(1, MAX_M + 1)])
    # 06: a star around island 1, the centre given second.
    write(6, MAX_M + 1, [(i, 1) for i in range(2, MAX_M + 2)])
    # 07: a path over all islands, built in a random order.
    path = [(i, i + 1) for i in range(1, MAX_N)]
    rng.shuffle(path)
    write(7, MAX_N, path[:MAX_M])
    # 08: few islands, many bridges: mostly wasted.
    write(8, 50, [tuple(rng.sample(range(1, 51), 2)) for _ in range(2000)])
    # 09: two halves grown separately, then joined by the last bridge.
    half = MAX_M // 2
    left = [(i, i + 1) for i in range(1, half)]
    right = [(i, i + 1) for i in range(half + 1, 2 * half)]
    bridges = []
    for x, y in zip(left, right):
        bridges.append(x)
        bridges.append(y)
    bridges.append((1, 2 * half))
    write(9, 2 * half, bridges)
    # 10: max size, a random forest over shuffled labels: every bridge joins two groups.
    perm = list(range(1, MAX_N + 1))
    rng.shuffle(perm)
    write(10, MAX_N, [(perm[i], perm[rng.randrange(i)]) for i in range(1, MAX_M + 1)])
    # 11: max size, uniform random pairs.
    write(11, MAX_N, [tuple(rng.sample(range(1, MAX_N + 1), 2)) for _ in range(MAX_M)])
    # 12: max n, but every bridge stays inside 300 low-numbered islands: the group count stays near n.
    pool = rng.sample(range(1, 1001), 300)
    write(12, MAX_N, [tuple(rng.sample(pool, 2)) for _ in range(MAX_M)])


main()
