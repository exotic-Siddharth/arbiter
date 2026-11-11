"""Hidden tests for night-ferries. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 20000
MAX_M = 30000
MAX_F = 10**6
MAX_P = 10**4
MAX_C = 10**4


def write(number, n, k, lines):
    rows = [f"{n} {len(lines)} {k}"] + [" ".join(map(str, line)) for line in lines]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(rows) + "\n")


def rand_line(rng, u, v):
    return (u, v, rng.randint(0, MAX_F), rng.randint(1, MAX_P), rng.randint(1, MAX_C))


def random_lines(rng, n, m, chain=False):
    lines = []
    if chain:
        order = [1] + rng.sample(range(2, n), n - 2) + [n]
        for a, b in zip(order, order[1:]):
            lines.append(rand_line(rng, a, b))
    while len(lines) < m:
        u, v = rng.sample(range(1, n + 1), 2)
        lines.append(rand_line(rng, u, v))
    rng.shuffle(lines)
    return lines


def main():
    rng = random.Random(12121108)
    # 03: two ports, one line, no tickets.
    write(3, 2, 0, [(1, 2, 7, 3, 5)])
    # 04: the only line sails the wrong way: unreachable for every j.
    write(4, 2, 3, [(2, 1, 0, 1, 1)])
    # 05: a direct line with a late timetable next to a long chain; with 3 tickets the
    #     direct line wins even though it has only one crossing.
    lines = [(1, 50, 900000, 10000, 3)]
    for a in range(1, 50):
        lines.append((a, a + 1, 0, 1, 1000))
    write(5, 50, 3, lines)
    # 06: max size random network, three tickets.
    write(6, MAX_N, 3, random_lines(rng, MAX_N, MAX_M, chain=True))
    # 07: a long chain through every port plus random extras, large periods, two tickets.
    lines = random_lines(rng, MAX_N, MAX_N - 1, chain=True)
    while len(lines) < MAX_M:
        u, v = rng.sample(range(1, MAX_N + 1), 2)
        lines.append((u, v, rng.randint(0, MAX_F), MAX_P, MAX_C))
    rng.shuffle(lines)
    write(7, MAX_N, 2, lines)
    # 08: few ports and many parallel lines, no tickets.
    write(8, 200, 0, random_lines(rng, 200, MAX_M))
    # 09: layered network (layers of 500 ports, port n alone at the end), forward lines only, three tickets.
    width, depth = 500, 40
    n = width * depth
    lines = []
    port = lambda layer, i: layer * width + i + 1
    for i in range(width):
        lines.append((1, port(1, i), rng.randint(0, 1000), rng.randint(1, MAX_P), rng.randint(1, 50)))
    while len(lines) < MAX_M - width:
        layer = rng.randint(1, depth - 3)
        lines.append((port(layer, rng.randrange(width)), port(layer + 1, rng.randrange(width)),
                      rng.randint(0, MAX_F), rng.randint(1, MAX_P), rng.randint(1, MAX_C)))
    for i in range(width):
        lines.append((port(depth - 2, i), n, rng.randint(0, MAX_F), rng.randint(1, MAX_P), rng.randint(1, MAX_C)))
    rng.shuffle(lines)
    write(9, n, 3, lines)
    # 10: max size, but no line ever arrives in port n: -1 for every j.
    lines = []
    while len(lines) < MAX_M:
        u, v = rng.sample(range(1, MAX_N), 2)
        lines.append(rand_line(rng, u, v))
    lines[0] = (MAX_N, 1, 0, 1, 1)
    write(10, MAX_N, 3, lines)
    # 11: tiny random network with three tickets.
    write(11, 10, 3, random_lines(rng, 10, 30))
    # 12: a chain where every arrival is exactly at a departure minute: no waiting at all.
    lines, clock = [], 0
    for a in range(1, 1001):
        c = rng.randint(1, MAX_C)
        p = rng.randint(1, MAX_P)
        lines.append((a, a + 1, clock % p, p, c))
        clock += c
    write(12, 1001, 1, lines)
    # 13: max size, every line leaves every minute: tickets never help.
    lines = [(u, v, 0, 1, c) for u, v, f, p, c in random_lines(rng, MAX_N, MAX_M, chain=True)]
    write(13, MAX_N, 3, lines)


main()
