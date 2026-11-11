# Correct but quadratic: for every tower, scan all earlier towers for the best one to follow.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, d = int(data[0]), int(data[1])
    h = [int(x) for x in data[2:2 + n]]
    best = [1] * n
    answers = []
    overall = 0
    for i in range(n):
        limit = h[i] - d
        b = 1
        for j in range(i):
            if h[j] <= limit and best[j] + 1 > b:
                b = best[j] + 1
        best[i] = b
        if b > overall:
            overall = b
        answers.append(overall)
    sys.stdout.write(" ".join(map(str, answers)) + "\n")


main()
