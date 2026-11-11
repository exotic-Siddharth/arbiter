import sys


def mark_starts(pat, text, n, starts):
    """KMP: set starts[s] = 1 for every s < n where pat occurs in text at offset s."""
    m = len(pat)
    fail = [0] * m
    k = 0
    for i in range(1, m):
        c = pat[i]
        while k and pat[k] != c:
            k = fail[k - 1]
        if pat[k] == c:
            k += 1
        fail[i] = k
    k = 0
    for i, c in enumerate(text):
        while k and pat[k] != c:
            k = fail[k - 1]
        if pat[k] == c:
            k += 1
            if k == m:
                starts[i - m + 1] = 1
                k = fail[k - 1]


def main():
    lines = sys.stdin.buffer.read().split()
    t, p = lines[0], lines[1]
    n, m = len(t), len(p)
    # Unroll the loop: every clockwise reading of m beads is a substring of t + t[:m-1].
    text = t + t[:m - 1]
    starts = bytearray(n)
    mark_starts(p, text, n, starts)
    back = p[::-1]
    if back != p:
        mark_starts(back, text, n, starts)
    count = starts.count(1)
    first = starts.find(1) + 1 if count else -1
    sys.stdout.write(f"{count} {first}\n")


main()
