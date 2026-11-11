"""Hidden tests for kiln-scheduling. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 50000
MAX_T = 10**6
MAX_D = 10**9


def write(number, w, pieces):
    lines = [f"{len(pieces)} {w}"] + [f"{t} {d}" for t, d in pieces]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def main():
    rng = random.Random(11111108)
    # 03: one piece that comes out exactly at its pick-up hour.
    write(3, 5, [(7, 12)])
    # 04: one piece that can never be on time: the answer is 0 W.
    write(4, 5, [(8, 12)])
    # 05: max n, the kiln starts too late for every piece.
    write(5, MAX_D, [(rng.randint(1, MAX_T), rng.randint(1, MAX_D - 1)) for _ in range(MAX_N)])
    # 06: max n, every pick-up hour is 10^9: about 10^4 pieces fit (the largest input).
    write(6, 0, [(rng.randint(1, MAX_T), MAX_D) for _ in range(MAX_N)])
    # 07: max n, random firing times and pick-up hours.
    write(7, rng.randint(0, 1000), [(rng.randint(1, MAX_T), rng.randint(1, MAX_D)) for _ in range(MAX_N)])
    # 08: max n, equal firing times and many equal pick-up hours.
    write(8, 3, [(1000, 1000 * rng.randint(1, MAX_N // 2)) for _ in range(MAX_N)])
    # 09: max n, one common pick-up hour: keep the shortest pieces.
    write(9, 12345, [(rng.randint(1, MAX_T), 5 * 10**8) for _ in range(MAX_N)])
    # 10: small random case with tight deadlines.
    write(10, 2, [(rng.randint(1, 9), rng.randint(1, 40)) for _ in range(20)])
    # 11: max n, long early pieces followed by short late ones: many replacements.
    pieces = []
    for i in range(MAX_N):
        if i % 2 == 0:
            pieces.append((rng.randint(MAX_T // 2, MAX_T), 1000 * (i + 1)))
        else:
            pieces.append((rng.randint(1, 1000), 2000 * (i + 1)))
    rng.shuffle(pieces)
    write(11, 0, pieces)
    # 12: max n, every pick-up hour equals the prefix sum of the firing times: all fit, no slack.
    w = 777
    times = [rng.randint(1, 19000) for _ in range(MAX_N)]
    pieces, clock = [], w
    for t in times:
        clock += t
        pieces.append((t, clock))
    rng.shuffle(pieces)
    write(12, w, pieces)
    # 13: medium random case, firing times large compared with the deadlines.
    write(13, 0, [(rng.randint(1, MAX_T), rng.randint(1, 3 * 10**7)) for _ in range(5000)])


main()
