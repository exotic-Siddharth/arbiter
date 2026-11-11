# Correct but O(n * q): walks over the whole stretch for every question.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    r = [int(x) for x in data[1:n + 1]]
    q = int(data[n + 1])
    out = []
    pos = n + 2
    for _ in range(q):
        a, b = int(data[pos]), int(data[pos + 1])
        pos += 2
        lo, hi = min(a, b), max(a, b)
        total = dry = 0
        for i in range(lo - 1, hi):
            total += r[i]
            if r[i] == 0:
                dry += 1
        out.append("%d %d" % (total, dry))
    sys.stdout.write("\n".join(out) + "\n")


main()
