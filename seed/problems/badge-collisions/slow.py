# Correct but quadratic: compares every code with every earlier one.
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    keys = [raw.replace(b"-", b"").upper() for raw in data[1:n + 1]]
    earlier = []
    distinct = 0
    for i in range(n):
        count = 0
        for j in range(i):
            if keys[j] == keys[i]:
                count += 1
        if count == 0:
            distinct += 1
        earlier.append(count)
    print(" ".join(map(str, earlier)))
    print(distinct, sum(earlier))


main()
