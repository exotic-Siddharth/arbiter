# Correct but slow: keeps the readings in a plain list and scans the stretch for every
# survey and alarm, O(n) per operation.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, q = int(data[0]), int(data[1])
    a = [int(x) for x in data[2:2 + n]]
    out = []
    pos = 2 + n
    for _ in range(q):
        kind, x, y = data[pos], int(data[pos + 1]), int(data[pos + 2])
        pos += 3
        if kind == b"1":
            a[x - 1] = y
        elif kind == b"2":
            part = a[x - 1:y]
            out.append(f"{sum(part)} {max(part)}")
        else:
            answer = -1
            for j in range(x - 1, n):
                if a[j] >= y:
                    answer = j + 1
                    break
            out.append(str(answer))
    sys.stdout.write("\n".join(out) + "\n")


main()
