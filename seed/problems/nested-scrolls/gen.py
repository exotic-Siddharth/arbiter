"""Hidden tests for nested-scrolls. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
TOTAL = 900000
MAX_T = 10000
OPEN = "([{<"
CLOSE = {"(": ")", "[": "]", "{": "}", "<": ">"}


def write(number, logs):
    assert 1 <= len(logs) <= MAX_T and sum(map(len, logs)) <= TOTAL and all(logs)
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{len(logs)}\n" + "\n".join(logs) + "\n")


def balanced(rng, pairs, open_bias=0.5, kinds=OPEN):
    """A random sound log with the given number of pairs."""
    out, stack, opens = [], [], pairs
    while opens or stack:
        if opens and (not stack or rng.random() < open_bias):
            ch = rng.choice(kinds)
            stack.append(ch)
            out.append(ch)
            opens -= 1
        else:
            out.append(CLOSE[stack.pop()])
    return "".join(out)


def corrupt(rng, log):
    """Change one random symbol into a different one."""
    i = rng.randrange(len(log))
    choices = [c for c in "()[]{}<>" if c != log[i]]
    return log[:i] + rng.choice(choices) + log[i + 1:]


def split_lengths(rng, total, count, low):
    """count positive lengths >= low summing to about total."""
    lengths = [low] * count
    for _ in range(total - low * count):
        lengths[rng.randrange(count)] += 1
    return lengths


def main():
    rng = random.Random(7031)
    # 03: minimal logs of every outcome.
    write(3, ["(", ")", "()", "<>", "[", "]", "{}", "}{", "<]", "{{}}"])
    # 04: one maximal sound log, depth 450000 (worst case for recursion).
    half = TOTAL // 2
    deep = "".join(rng.choice(OPEN) for _ in range(half))
    write(4, [deep + "".join(CLOSE[c] for c in reversed(deep))])
    # 05: many short sound logs.
    write(5, [balanced(rng, n // 2) for n in split_lengths(rng, TOTAL, MAX_T, 2) if n // 2])
    # 06: many logs, half of them corrupted at one random symbol.
    logs = []
    for n in split_lengths(rng, TOTAL - 2 * MAX_T, MAX_T, 2):
        log = balanced(rng, n // 2, open_bias=0.6)
        logs.append(corrupt(rng, log) if rng.random() < 0.5 else log)
    write(6, logs)
    # 07: unclosed logs whose outermost and innermost open cases differ; the open
    # cases sit after a closed prefix, so the answer is not position 1.
    logs = []
    for _ in range(9):
        prefix = balanced(rng, 20000)
        tail = "".join(rng.choice(OPEN) for _ in range(20000))
        logs.append(prefix + "(" + balanced(rng, 15000) + "[" + tail)
    write(7, logs)
    # 08: a long sound log that breaks only at its very last symbol.
    log = balanced(rng, half - 1)
    write(8, [log + "(" + "]"])
    # 09: the first symbol is a closer, followed by a long sound log.
    write(9, ["}" + balanced(rng, half - 1)])
    # 10: flat logs of depth 1 over one kind, and a deep single-kind log.
    write(10, ["()" * 100000, "<>" * 100000, "[" * 100000 + "]" * 100000, "{" * 50000 + "}" * 49999 + ")"])
    # 11: near-sound logs: one symbol changed in each, mixed with sound ones.
    logs = []
    for _ in range(1000):
        log = balanced(rng, rng.randint(1, 400))
        logs.append(corrupt(rng, log) if rng.random() < 0.7 else log)
    write(11, logs)
    # 12: closers arriving on an empty stack in the middle, and the right kind of closer too late.
    write(12, ["()]", "<>()>", "[[]]]", "(" * 5 + ")" * 6, "{[()]}{", "({)}", "<[>]", "((((((((((((", "))", "[](){}<>"])
    # 13: unclosed logs with a deep open stack after sound blocks (top differs from the bottom).
    logs = []
    for _ in range(MAX_T // 10):
        block = balanced(rng, rng.randint(0, 20))
        opened = "".join(rng.choice(OPEN) for _ in range(rng.randint(2, 30)))
        logs.append((block + opened + balanced(rng, rng.randint(0, 10))) or "(")
    write(13, logs)


main()
