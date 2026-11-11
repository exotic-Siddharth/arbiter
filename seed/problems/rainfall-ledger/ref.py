import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    rain = [0] * (n + 1)  # rain[i] = total rain of days 1..i
    dry = [0] * (n + 1)  # dry[i] = dry days among days 1..i
    total = dry_days = 0
    for i in range(1, n + 1):
        r = int(data[i])
        total += r
        if r == 0:
            dry_days += 1
        rain[i] = total
        dry[i] = dry_days
    q = int(data[n + 1])
    out = []
    pos = n + 2
    for _ in range(q):
        a = int(data[pos])
        b = int(data[pos + 1])
        pos += 2
        if a > b:
            a, b = b, a
        out.append("%d %d" % (rain[b] - rain[a - 1], dry[b] - dry[a - 1]))
    sys.stdout.write("\n".join(out) + "\n")


main()
