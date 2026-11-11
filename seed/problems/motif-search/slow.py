# Correct but slow: compares the motif letter by letter at every bead, O(n * m) in the worst
# case (long runs of one letter with a mismatch at the very end of the motif).
import sys


def main():
    lines = sys.stdin.buffer.read().split()
    t, p = lines[0], lines[1]
    n, m = len(t), len(p)
    back = p[::-1]
    count, first = 0, -1
    for i in range(n):
        found = False
        for pat in (p, back):
            j = 0
            while j < m and t[(i + j) % n] == pat[j]:
                j += 1
            if j == m:
                found = True
                break
        if found:
            count += 1
            if first < 0:
                first = i + 1
    sys.stdout.write(f"{count} {first}\n")


main()
