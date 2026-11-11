# Bug: runs the unlimited-supply loop for every design, so a commemorative stamp may be
# used several times. In the samples no query is large enough to use one twice.
import sys

MOD = 10 ** 9 + 7


def main():
    data = sys.stdin.buffer.read().split()
    n, q = int(data[0]), int(data[1])
    values = [int(x) for x in data[2:2 + n]]
    queries = [int(x) for x in data[3 + n:3 + n + q]]
    top = max(queries)
    ways = [0] * (top + 1)
    ways[0] = 1
    for v in values:
        for p in range(v, top + 1):
            ways[p] = (ways[p] + ways[p - v]) % MOD
    print("\n".join(str(ways[p]) for p in queries))


main()
