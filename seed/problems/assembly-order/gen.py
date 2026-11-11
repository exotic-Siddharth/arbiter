"""Hidden tests for assembly-order. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 40000
MAX_M = 50000


def write(number, codes, rules):
    n = len(codes)
    lines = [f"{n} {len(rules)}", " ".join(map(str, codes))]
    lines += [f"{a} {b}" for a, b in rules]
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")


def random_codes(rng, n):
    codes = list(range(1, n + 1))
    rng.shuffle(codes)
    return codes


def random_dag(rng, n, m):
    """Rules that all go forward in a hidden random order, so the rule set is acyclic."""
    hidden = list(range(1, n + 1))
    rng.shuffle(hidden)
    rules = []
    for _ in range(m):
        i, j = sorted(rng.sample(range(n), 2))
        rules.append((hidden[i], hidden[j]))
    return rules, hidden


def main():
    rng = random.Random(15110801)
    # 03: a single task, no rules.
    write(3, [1], [])
    # 04: a single task that waits for itself.
    write(4, [1], [(1, 1)])
    # 05: two tasks that need each other, the rule repeated.
    write(5, [2, 1], [(1, 2), (2, 1), (1, 2)])
    # 06: max n, no rules: the answer is the tasks sorted by code.
    write(6, random_codes(rng, MAX_N), [])
    # 07: one forced chain through shuffled labels: a unique order.
    chain = list(range(1, MAX_N + 1))
    rng.shuffle(chain)
    write(7, random_codes(rng, MAX_N), [(chain[i], chain[i + 1]) for i in range(MAX_N - 1)])
    # 08: max size random DAG, random codes.
    rules, _ = random_dag(rng, MAX_N, MAX_M)
    write(8, random_codes(rng, MAX_N), rules)
    # 09: rules only run from low to high task numbers, codes in decreasing order:
    # the code order fights the numbering as much as the rules allow.
    rules = []
    for _ in range(MAX_M):
        a, b = sorted(rng.sample(range(1, MAX_N + 1), 2))
        rules.append((a, b))
    write(9, list(range(MAX_N, 0, -1)), rules)
    # 10: a hub that everything waits for and a sink that waits for everything.
    n = 25002
    hub, sink = 1, n
    rules = [(hub, i) for i in range(2, n)] + [(i, sink) for i in range(2, n)]
    rng.shuffle(rules)
    write(10, random_codes(rng, n), rules)
    # 11: a dense DAG on few tasks with every rule repeated several times.
    n = 300
    rules, _ = random_dag(rng, n, 1000)
    rules = [r for r in rules for _ in range(50)][:MAX_M]
    rng.shuffle(rules)
    write(11, random_codes(rng, n), rules)
    # 12: a big DAG plus one back rule that closes a circle in the middle: a large stuck set.
    rules, hidden = random_dag(rng, MAX_N, MAX_M - 2)
    rules.append((hidden[MAX_N * 3 // 4], hidden[MAX_N // 4]))
    rules.append((hidden[MAX_N // 4], hidden[MAX_N * 3 // 4]))
    write(12, random_codes(rng, MAX_N), rules)
    # 13: a big DAG plus one task that waits for itself, deep inside.
    rules, hidden = random_dag(rng, MAX_N, MAX_M - 1)
    rules.append((hidden[MAX_N // 2], hidden[MAX_N // 2]))
    write(13, random_codes(rng, MAX_N), rules)
    # 14: one circle through all tasks.
    ring = list(range(1, MAX_N + 1))
    rng.shuffle(ring)
    write(14, random_codes(rng, MAX_N), [(ring[i], ring[(i + 1) % MAX_N]) for i in range(MAX_N)])


main()
