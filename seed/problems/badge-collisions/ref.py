import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    seen = {}
    earlier = []
    pairs = 0
    for raw in data[1:n + 1]:
        key = raw.replace(b"-", b"").upper()
        count = seen.get(key, 0)
        earlier.append(count)
        pairs += count
        seen[key] = count + 1
    sys.stdout.write(" ".join(map(str, earlier)) + "\n" + str(len(seen)) + " " + str(pairs) + "\n")


main()
