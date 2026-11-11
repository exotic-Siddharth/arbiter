# Correct but slow: simulates the escape for every waiting time w = 0, 1, 2, ... with a
# full time-constrained BFS each time. O(r * c * answer).
import sys

INF = 1 << 60


def main():
    data = sys.stdin.buffer.read().split()
    r, c = int(data[0]), int(data[1])
    grid = [data[2 + i].decode() for i in range(r)]
    flood = [[INF] * c for _ in range(r)]
    queue = []
    for i in range(r):
        for j in range(c):
            if grid[i][j] == "W":
                flood[i][j] = 0
                queue.append((i, j))
            elif grid[i][j] == "S":
                start = (i, j)
    head = 0
    while head < len(queue):
        i, j = queue[head]
        head += 1
        for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= a < r and 0 <= b < c and grid[a][b] != "#" and flood[a][b] == INF:
                flood[a][b] = flood[i][j] + 1
                queue.append((a, b))

    def escape(w):
        """Earliest minute out when leaving at minute w, or -1."""
        si, sj = start
        if flood[si][sj] <= w:
            return -1
        seen = [[False] * c for _ in range(r)]
        seen[si][sj] = True
        frontier = [start]
        minute = w
        while frontier:
            minute += 1
            nxt = []
            for i, j in frontier:
                for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                    if 0 <= a < r and 0 <= b < c and not seen[a][b] and grid[a][b] not in "#W" and flood[a][b] > minute:
                        if grid[a][b] == "E":
                            return minute
                        seen[a][b] = True
                        nxt.append((a, b))
            frontier = nxt
        return -1

    first = escape(0)
    print(first)
    if first < 0:
        print(-1)
        return
    w = 0
    limit = r * c  # every finite flood time is below r * c
    while w <= limit and escape(w + 1) >= 0:
        w += 1
    print("FOREVER" if w > limit else w)


main()
