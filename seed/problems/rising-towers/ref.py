import sys
from bisect import bisect_right


def main():
    data = sys.stdin.buffer.read().split()
    n, d = int(data[0]), int(data[1])
    # tails[k] = smallest last height of a staircase of length k + 1 seen so far.
    # tails is non-decreasing, so the longest staircase a new tower h can extend is
    # the number of tails that are <= h - d.
    tails = []
    answers = []
    for i in range(n):
        h = int(data[2 + i])
        k = bisect_right(tails, h - d)
        if k == len(tails):
            tails.append(h)
        elif h < tails[k]:
            tails[k] = h
        answers.append(len(tails))
    sys.stdout.write(" ".join(map(str, answers)) + "\n")


main()
