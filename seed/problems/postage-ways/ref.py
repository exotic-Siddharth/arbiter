import sys
from itertools import accumulate
from operator import add

MOD = 10 ** 9 + 7


def main():
    data = sys.stdin.buffer.read().split()
    n, q = int(data[0]), int(data[1])
    values = [int(x) for x in data[2:2 + n]]
    kinds = data[2 + n]
    queries = [int(x) for x in data[3 + n:3 + n + q]]
    top = max(queries)
    ways = [0] * (top + 1)  # ways[p] = number of collections worth exactly p
    ways[0] = 1
    for v, kind in zip(values, kinds):
        if v > top:
            continue
        if kind == 82:  # 'R', unlimited: new[p] = old[p] + new[p - v], which is a running
            # sum along each residue class p = r, r + v, r + 2v, ...
            for r in range(v):
                ways[r::v] = [x % MOD for x in accumulate(ways[r::v])]
        else:  # 'C', at most once: new[p] = old[p] + old[p - v]
            shifted = map(add, ways[v:], ways[:top + 1 - v])
            ways[v:] = [x - MOD if x >= MOD else x for x in shifted]
    sys.stdout.write("\n".join(str(ways[p]) for p in queries) + "\n")


main()
