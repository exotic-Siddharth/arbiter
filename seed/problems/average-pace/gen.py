"""Hidden tests for average-pace. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 60000
MAX_D = 100000
MAX_T = 1000000


def write(number, segments):
    assert 1 <= len(segments) <= MAX_N
    assert all(1 <= d <= MAX_D and 1 <= t <= MAX_T for d, t in segments)
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{len(segments)}\n" + "".join(f"{d} {t}\n" for d, t in segments))


def realistic(rng):
    """A running segment: 50 m to 5 km at 3 to 9 minutes per kilometre."""
    d = rng.randint(50, 5000)
    return d, max(1, round(d * rng.uniform(0.18, 0.54)))


def main():
    rng = random.Random(4242)
    # 03: a single segment.
    write(3, [(1609, 427)])
    # 04: two segments of different length: nothing is trimmed, total time / total distance.
    write(4, [(100, 15), (5000, 1800)])
    # 05: three segments: exactly one is kept.
    write(5, [(1000, 240), (1000, 400), (2500, 750)])
    # 06: every segment has the same pace but a different length.
    write(6, [(d, 3 * d) for d in (rng.randint(1, 33333) for _ in range(1000))])
    # 07: ties for fastest and slowest between segments of different lengths; the
    # smallest index must be discarded.
    segments = [realistic(rng) for _ in range(500)]
    segments[10] = (100, 10)
    segments[20] = (5000, 500)
    segments[30] = (300, 300)
    segments[40] = (4000, 4000)
    segments[50] = (2000, 200)
    write(7, segments)
    # 08: max n, realistic segments.
    write(8, [realistic(rng) for _ in range(MAX_N)])
    # 09: max n, extreme segments: 1 m in 10^6 s and 10^5 m in 1 s among normal ones.
    segments = [realistic(rng) for _ in range(MAX_N)]
    for i in rng.sample(range(MAX_N), 200):
        segments[i] = (1, MAX_T) if rng.random() < 0.5 else (MAX_D, 1)
    write(9, segments)
    # 10: max n, every value at its maximum (the largest input).
    write(10, [(MAX_D, MAX_T)] * MAX_N)
    # 11: medium random over the whole range.
    write(11, [(rng.randint(1, MAX_D), rng.randint(1, MAX_T)) for _ in range(2000)])
    # 12: three identical segments.
    write(12, [(400, 80)] * 3)
    # 13: max n, uniformly random over the whole range.
    write(13, [(rng.randint(1, MAX_D), rng.randint(1, MAX_T)) for _ in range(MAX_N)])


main()
