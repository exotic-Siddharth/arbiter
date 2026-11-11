# Bug: treats a combined weight exactly equal to C as unsafe (strict < instead of <=).
# No pair in the samples sums to exactly C, so it passes them.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, cap = int(data[0]), int(data[1])
    w = sorted(map(int, data[2:2 + n]))
    pairs = 0
    best = -1
    i, j = 0, n - 1
    while i < j:
        s = w[i] + w[j]
        if s < cap:
            pairs += j - i
            best = max(best, s)
            i += 1
        else:
            j -= 1
    print(pairs, best)


main()
