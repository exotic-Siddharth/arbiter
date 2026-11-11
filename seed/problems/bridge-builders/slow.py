# Correct but slow "quick-find": every island stores its group label, and joining two groups
# relabels the whole array, which costs O(n) per useful bridge.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    label = list(range(n + 1))
    count = [1] * (n + 1)
    groups, largest, wasted = n, 1, 0
    out = []
    for i in range(m):
        a, b = int(data[2 + 2 * i]), int(data[3 + 2 * i])
        la, lb = label[a], label[b]
        if la == lb:
            wasted += 1
        else:
            label = [la if x == lb else x for x in label]
            count[la] += count[lb]
            groups -= 1
            largest = max(largest, count[la])
        out.append(f"{groups} {largest} {wasted}")
    sys.stdout.write("\n".join(out) + "\n")


main()
