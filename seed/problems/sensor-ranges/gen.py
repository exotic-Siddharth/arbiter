"""Hidden tests for sensor-ranges. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 40000
MAX_Q = 40000
MAX_V = 10**6


def write(number, readings, ops):
    lines = [f"{len(readings)} {len(ops)}", " ".join(map(str, readings))]
    lines += [" ".join(map(str, op)) for op in ops]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def random_op(rng, n, vmax, weights=(1, 1, 1)):
    kind = rng.choices((1, 2, 3), weights)[0]
    if kind == 1:
        return (1, rng.randint(1, n), rng.randint(0, vmax))
    if kind == 2:
        l, r = sorted((rng.randint(1, n), rng.randint(1, n)))
        return (2, l, r)
    return (3, rng.randint(1, n), rng.randint(0, vmax))


def main():
    rng = random.Random(13131108)
    # 03: one sensor, one survey.
    write(3, [0], [(2, 1, 1)])
    # 04: one sensor, alarms at the extremes of x.
    write(4, [MAX_V], [(3, 1, 0), (3, 1, MAX_V), (1, 1, 0), (3, 1, 1), (3, 1, 0), (2, 1, 1)])
    # 05: max size, every reading 10^6, full-length surveys: totals of 4 * 10^10.
    write(5, [MAX_V] * MAX_N, [(2, 1, MAX_N)] * (MAX_Q - 1) + [(3, MAX_N, MAX_V)])
    # 06: max size, random mix of all three operations.
    n = MAX_N
    write(6, [rng.randint(0, 10**5) for _ in range(n)], [random_op(rng, n, 10**5) for _ in range(MAX_Q)])
    # 07: max size, alarms with x = 0 (always the start sensor) and x = 10^6 (rare).
    ops = []
    for _ in range(MAX_Q):
        r = rng.random()
        if r < 0.4:
            ops.append((3, rng.randint(1, n), 0))
        elif r < 0.8:
            ops.append((3, rng.randint(1, n), MAX_V))
        else:
            ops.append((1, rng.randint(1, n), rng.choice((MAX_V, rng.randint(0, MAX_V - 1)))))
    write(7, [rng.randint(0, MAX_V - 1) for _ in range(n)], ops)
    # 08: max size, increasing readings with alarms and a few updates.
    readings = [25 * i for i in range(n)]
    write(8, readings, [random_op(rng, n, 25 * n, (1, 2, 7)) for _ in range(MAX_Q)])
    # 09: max size, mostly updates, short surveys.
    ops = []
    for _ in range(MAX_Q):
        if rng.random() < 0.9:
            ops.append((1, rng.randint(1, n), rng.randint(0, 999)))
        else:
            l = rng.randint(1, n)
            ops.append((2, l, min(n, l + rng.randint(0, 20))))
    write(9, [rng.randint(0, 999) for _ in range(n)], ops)
    # 10: small with tiny readings: many ties.
    write(10, [rng.randint(0, 5) for _ in range(10)], [random_op(rng, 10, 5) for _ in range(100)])
    # 11: max n, all zero readings, spikes appear through updates; x = 0 and x = 1.
    ops = []
    for _ in range(MAX_Q):
        r = rng.random()
        if r < 0.05:
            ops.append((1, rng.randint(1, n), rng.randint(0, 3)))
        elif r < 0.5:
            ops.append((3, rng.randint(1, n), rng.randint(0, 1)))
        else:
            l, rr = sorted((rng.randint(1, n), rng.randint(1, n)))
            ops.append((2, l, rr))
    write(11, [0] * n, ops)
    # 12: max n, the only high reading sits near the end and is moved by updates.
    readings = [rng.randint(0, 9) for _ in range(n)]
    readings[-1] = 500
    ops, spot = [], n
    for _ in range(MAX_Q):
        if rng.random() < 0.1:
            ops.append((1, spot, 0))
            spot = rng.randint(n - 100, n)
            ops.append((1, spot, 500))
        else:
            ops.append((3, rng.randint(1, 50), 100))
    write(12, readings, ops[:MAX_Q])
    # 13: max size, high readings everywhere but below every threshold: each alarm walks to
    #     the end and finds nothing (the largest input, worst for a linear scan).
    readings = [rng.randint(900000, 999999) for _ in range(n)]
    ops = []
    for _ in range(MAX_Q):
        if rng.random() < 0.02:
            ops.append((1, rng.randint(10000, n), rng.randint(900000, 999999)))
        else:
            ops.append((3, rng.randint(10000, 10999), MAX_V))
    write(13, readings, ops)


main()
