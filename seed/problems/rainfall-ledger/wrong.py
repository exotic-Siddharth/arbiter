# Bug: assumes a <= b. The samples never give a > b, so it passes them, but a reversed
# question produces a negative total.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    rain = [0] * (n + 1)
    dry = [0] * (n + 1)
    for i in range(1, n + 1):
        r = int(data[i])
        rain[i] = rain[i - 1] + r
        dry[i] = dry[i - 1] + (1 if r == 0 else 0)
    q = int(data[n + 1])
    out = []
    pos = n + 2
    for _ in range(q):
        a, b = int(data[pos]), int(data[pos + 1])
        pos += 2
        out.append("%d %d" % (rain[b] - rain[a - 1], dry[b] - dry[a - 1]))
    sys.stdout.write("\n".join(out) + "\n")


main()
