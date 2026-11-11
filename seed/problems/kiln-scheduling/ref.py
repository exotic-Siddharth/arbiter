import heapq
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, w = int(data[0]), int(data[1])
    pieces = sorted(
        (int(data[3 + 2 * i]), int(data[2 + 2 * i])) for i in range(n)
    )  # (deadline, firing time), earliest deadline first
    # Keep a max-heap of the chosen firing times. When the newest piece makes the
    # schedule late, drop the longest chosen piece: the count stays the largest possible
    # and the total firing time stays the smallest possible for that count.
    heap = []
    total = 0
    for deadline, t in pieces:
        heapq.heappush(heap, -t)
        total += t
        if w + total > deadline:
            total += heapq.heappop(heap)
    sys.stdout.write(f"{len(heap)} {w + total}\n")


main()
