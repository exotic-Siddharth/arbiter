"""Hidden tests for badge-collisions. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import string
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX_N = 100000
CHARS = string.ascii_uppercase + string.digits


def write(number, codes):
    text = f"{len(codes)}\n" + "\n".join(codes) + "\n"
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(text)


def disguise(rng, base):
    """Random case and up to 8 - len(base) hyphens inserted anywhere."""
    chars = [c.lower() if c.isalpha() and rng.random() < 0.5 else c for c in base]
    for _ in range(rng.randint(0, 8 - len(base))):
        chars.insert(rng.randint(0, len(chars)), "-")
    return "".join(chars)


def random_base(rng, alphabet, low, high):
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(low, high)))


def main():
    rng = random.Random(20261108)
    # 03: a single attendee.
    write(3, ["a-B"])
    # 04: two codes that differ only by a swap: no collision.
    write(4, ["AB21", "ab12"])
    # 05: max n, every code is the same badge in disguise (about 5 * 10^9 pairs).
    write(5, [disguise(rng, "Z9Y8") for _ in range(MAX_N)])
    # 06: max n, short codes over a tiny alphabet: heavy collisions.
    write(6, [disguise(rng, random_base(rng, "AB1", 1, 3)) for _ in range(MAX_N)])
    # 07: max n, all distinct 8-character codes (the largest input).
    seen, codes = set(), []
    while len(codes) < MAX_N:
        code = random_base(rng, CHARS, 8, 8)
        if code not in seen:
            seen.add(code)
            codes.append("".join(c.lower() if rng.random() < 0.3 else c for c in code))
    write(7, codes)
    # 08: medium random mix.
    write(8, [disguise(rng, random_base(rng, "ABCD12", 1, 4)) for _ in range(1000)])
    # 09: max n, hyphen-heavy codes over two letters.
    write(9, [disguise(rng, random_base(rng, "ab".upper(), 2, 4)) for _ in range(MAX_N)])
    # 10: case-only differences.
    write(10, [disguise(rng, random_base(rng, "XYZ", 3, 3)).replace("-", "") for _ in range(50000)])
    # 11: max n, digit codes where hyphens split numbers ("1-2" equals "12").
    write(11, [disguise(rng, random_base(rng, "12", 1, 5)) for _ in range(MAX_N)])
    # 12: tricky small set: trailing and leading hyphens, hyphen-only padding, mixed case.
    write(12, ["-a", "a-", "A", "--a--", "aa", "a-a", "AA-", "1", "-1-", "l", "L", "I", "i1", "I-1", "o0", "O-0", "0O"])


main()
