import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, q = int(data[0]), int(data[1])
    size = 1
    while size < n:
        size *= 2
    # Bottom-up segment tree over positions 0..size-1 with sums and maxima.
    # Padding leaves hold -1 for the maximum, so no alarm ever stops there.
    sm = [0] * (2 * size)
    mx = [-1] * (2 * size)
    for i in range(n):
        v = int(data[2 + i])
        sm[size + i] = v
        mx[size + i] = v
    for i in range(size - 1, 0, -1):
        sm[i] = sm[2 * i] + sm[2 * i + 1]
        a, b = mx[2 * i], mx[2 * i + 1]
        mx[i] = a if a > b else b
    out = []
    pos = 2 + n
    for _ in range(q):
        kind, x, y = data[pos], int(data[pos + 1]), int(data[pos + 2])
        pos += 3
        if kind == b"1":
            i = x - 1 + size
            sm[i] = mx[i] = y
            i >>= 1
            while i:
                sm[i] = sm[2 * i] + sm[2 * i + 1]
                a, b = mx[2 * i], mx[2 * i + 1]
                mx[i] = a if a > b else b
                i >>= 1
        elif kind == b"2":
            lo, hi = x - 1 + size, y + size  # half-open [lo, hi)
            total, best = 0, -1
            while lo < hi:
                if lo & 1:
                    total += sm[lo]
                    if mx[lo] > best:
                        best = mx[lo]
                    lo += 1
                if hi & 1:
                    hi -= 1
                    total += sm[hi]
                    if mx[hi] > best:
                        best = mx[hi]
                lo >>= 1
                hi >>= 1
            out.append(f"{total} {best}")
        else:
            # Walk right from leaf l: climb while the node is a right child, step to the
            # next sibling, and descend into the first node whose maximum reaches y.
            i = x - 1 + size
            while mx[i] < y:
                while i & 1:
                    i >>= 1
                if i == 0:
                    break
                i += 1
            if i == 0:
                out.append("-1")
            else:
                while i < size:
                    i = 2 * i if mx[2 * i] >= y else 2 * i + 1
                out.append(str(i - size + 1))
    sys.stdout.write("\n".join(out) + "\n")


main()
