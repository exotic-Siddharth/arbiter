import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    parent = list(range(n + 1))
    size = [1] * (n + 1)
    groups, largest, wasted = n, 1, 0
    out = []
    pos = 2
    for _ in range(m):
        a, b = int(data[pos]), int(data[pos + 1])
        pos += 2
        # find with path halving
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        while parent[b] != b:
            parent[b] = parent[parent[b]]
            b = parent[b]
        if a == b:
            wasted += 1
        else:
            if size[a] < size[b]:
                a, b = b, a
            parent[b] = a
            size[a] += size[b]
            groups -= 1
            if size[a] > largest:
                largest = size[a]
        out.append(f"{groups} {largest} {wasted}")
    sys.stdout.write("\n".join(out) + "\n")


main()
