import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    d = list(map(int, data[1:2 * n + 1:2]))
    t = list(map(int, data[2:2 * n + 2:2]))
    keep = [True] * n
    if n >= 3:
        # Paces t/d are compared exactly by cross-multiplication; strict comparisons keep
        # the smallest index on ties.
        fast = 0
        for i in range(1, n):
            if t[i] * d[fast] < t[fast] * d[i]:
                fast = i
        keep[fast] = False
        slow = -1
        for i in range(n):
            if keep[i] and (slow < 0 or t[i] * d[slow] > t[slow] * d[i]):
                slow = i
        keep[slow] = False
    total_d = sum(x for x, k in zip(d, keep) if k)
    total_t = sum(x for x, k in zip(t, keep) if k)
    # (T / 60) / (D / 1000) = 50 T / (3 D)
    sys.stdout.write("%.9f\n" % (50 * total_t / (3 * total_d)))


main()
