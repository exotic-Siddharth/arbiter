import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, cap = int(data[0]), int(data[1])
    w = sorted(map(int, data[2:2 + n]))
    pairs = 0
    best = -1
    i, j = 0, n - 1
    while i < j:
        s = w[i] + w[j]
        if s <= cap:
            # w[i] pairs safely with every member i+1..j; w[j] is its heaviest partner.
            pairs += j - i
            if s > best:
                best = s
            i += 1
        else:
            j -= 1
    sys.stdout.write("%d %d\n" % (pairs, best))


main()
