# Correct but slow: tries every spacing 1, 2, 3, ... until it stops being achievable,
# instead of binary searching. O(answer * n).
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    flags = data[2 + n].decode()
    hooks = sorted((int(data[2 + i]), flags[i] == "1") for i in range(n))
    if sum(1 for _, r in hooks if r) > k:
        print(-1)
        return
    next_reserved = [None] * n
    for i in range(n - 2, -1, -1):
        x, r = hooks[i + 1]
        next_reserved[i] = x if r else next_reserved[i + 1]

    def can(g):
        count = 0
        last = None
        for i, (x, r) in enumerate(hooks):
            if r:
                if last is not None and x - last < g:
                    return False
            elif (last is not None and x - last < g) or (next_reserved[i] is not None and next_reserved[i] - x < g):
                continue
            count += 1
            last = x
        return count >= k

    g = 1
    while can(g + 1):
        g += 1
    print(g)


main()
