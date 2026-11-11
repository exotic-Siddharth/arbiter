# Bug: averages the paces of the kept segments instead of dividing total time by total
# distance. Every segment in the samples has the same length, where both agree.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    seg = [(int(data[1 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)]
    keep = list(range(n))
    if n >= 3:
        fast = min(keep, key=lambda i: (seg[i][1] / seg[i][0], i))
        keep.remove(fast)
        slow = min(keep, key=lambda i: (-seg[i][1] / seg[i][0], i))
        keep.remove(slow)
    paces = [(seg[i][1] / 60) / (seg[i][0] / 1000) for i in keep]
    print("%.9f" % (sum(paces) / len(paces)))


main()
