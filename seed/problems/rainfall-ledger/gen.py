"""Hidden tests for rainfall-ledger. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 100000
MAX_Q = 25000
MAX_R = 10000


def write(number, rain, questions):
    lines = [str(len(rain)), " ".join(map(str, rain)), str(len(questions))]
    lines += ["%d %d" % ab for ab in questions]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def random_rain(rng, n, dry_share):
    return [0 if rng.random() < dry_share else rng.randint(1, MAX_R) for _ in range(n)]


def random_questions(rng, n, q):
    return [(rng.randint(1, n), rng.randint(1, n)) for _ in range(q)]


def main():
    rng = random.Random(5150)
    # 03: one dry day.
    write(3, [0], [(1, 1)])
    # 04: one wet day at the maximum, asked several times.
    write(4, [MAX_R], [(1, 1)] * 3)
    # 05: max size, random rain with some dry days, random order of a and b.
    write(5, random_rain(rng, MAX_N, 0.2), random_questions(rng, MAX_N, MAX_Q))
    # 06: max n, a completely dry ledger.
    write(6, [0] * MAX_N, random_questions(rng, MAX_N, MAX_Q))
    # 07: max n, every day at the maximum (largest input; long stretches).
    write(7, [MAX_R] * MAX_N, [(rng.randint(1, 1000), rng.randint(MAX_N - 1000, MAX_N)) for _ in range(MAX_Q)])
    # 08: full-range questions in both orders.
    write(8, random_rain(rng, MAX_N, 0.5), [(1, MAX_N), (MAX_N, 1)] * (MAX_Q // 2))
    # 09: every question has a > b.
    rain = random_rain(rng, MAX_N, 0.3)
    questions = []
    for _ in range(MAX_Q):
        a, b = rng.randint(1, MAX_N), rng.randint(1, MAX_N)
        questions.append((max(a, b), min(a, b)) if a != b else (a, a))
    write(9, rain, questions)
    # 10: single-day stretches only.
    write(10, random_rain(rng, MAX_N, 0.5), [(d, d) for d in (rng.randint(1, MAX_N) for _ in range(MAX_Q))])
    # 11: medium size, half the days dry.
    write(11, random_rain(rng, 2000, 0.5), random_questions(rng, 2000, 3000))
    # 12: short stretches at both ends of the ledger.
    rain = random_rain(rng, MAX_N, 0.1)
    questions = []
    for _ in range(MAX_Q):
        if rng.random() < 0.5:
            questions.append((rng.randint(1, 3), rng.randint(1, 3)))
        else:
            questions.append((rng.randint(MAX_N - 2, MAX_N), rng.randint(MAX_N - 2, MAX_N)))
    write(12, rain, questions)


main()
