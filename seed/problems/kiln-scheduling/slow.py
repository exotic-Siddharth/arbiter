# Correct but quadratic: dp[k] = smallest total firing time of k on-time pieces among the
# pieces seen so far (in deadline order). Every piece updates every count.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, w = int(data[0]), int(data[1])
    pieces = sorted((int(data[3 + 2 * i]), int(data[2 + 2 * i])) for i in range(n))
    dp = [0]
    for deadline, t in pieces:
        limit = deadline - w - t
        if dp[-1] <= limit:
            dp.append(dp[-1] + t)
        for k in range(len(dp) - 2, -1, -1):
            if dp[k] <= limit and dp[k] + t < dp[k + 1]:
                dp[k + 1] = dp[k] + t
    k = len(dp) - 1
    sys.stdout.write(f"{k} {w + dp[k]}\n")


main()
