import sys

INF = 1 << 60
# Byte translation tables: 1 where water may spread (not '#'), 1 where the archivist may walk.
OPEN = bytes(0 if ch == ord("#") else 1 for ch in range(256))
WALK = bytes(0 if ch in (ord("#"), ord("W")) else 1 for ch in range(256))


def bfs(starts, passable, width):
    """Multi-source BFS on a flat grid padded with a wall border."""
    free = bytearray(passable)  # cleared once a cell is visited
    dist = [INF] * len(free)
    for s in starts:
        dist[s] = 0
        free[s] = 0
    frontier = list(starts)
    level = 0
    while frontier:
        level += 1
        nxt = []
        push = nxt.append
        for u in frontier:
            v = u + 1
            if free[v]:
                free[v] = 0
                dist[v] = level
                push(v)
            v = u - 1
            if free[v]:
                free[v] = 0
                dist[v] = level
                push(v)
            v = u + width
            if free[v]:
                free[v] = 0
                dist[v] = level
                push(v)
            v = u - width
            if free[v]:
                free[v] = 0
                dist[v] = level
                push(v)
        frontier = nxt
    return dist


def find_all(grid, ch):
    out = []
    i = grid.find(ch)
    while i >= 0:
        out.append(i)
        i = grid.find(ch, i + 1)
    return out


def main():
    data = sys.stdin.buffer.read().split()
    r, c = int(data[0]), int(data[1])
    width = c + 2
    border = b"#" * width
    grid = border + b"".join(b"#" + row + b"#" for row in data[2:2 + r]) + border
    water = find_all(grid, b"W")
    exits = find_all(grid, b"E")
    start = grid.find(b"S")
    flood = bfs(water, grid.translate(OPEN), width)
    dist = bfs([start], grid.translate(WALK), width)
    # Water spreads one cell per minute, so flood times of neighbouring cells differ by at
    # most 1. Along a path, flood(p_i) - i never increases, so a route is safe iff its last
    # cell is: leaving at minute w along a shortest route to exit e works iff
    # w + dist[e] < flood[e].
    earliest = -1
    wait = -1
    for e in exits:
        if dist[e] == INF:
            continue
        if flood[e] == INF:
            wait = INF
        else:
            wait = max(wait, flood[e] - dist[e] - 1)
        if dist[e] < flood[e] and (earliest < 0 or dist[e] < earliest):
            earliest = dist[e]
    if wait < 0:
        wait = -1
    sys.stdout.write("%d\n%s\n" % (earliest, "FOREVER" if wait == INF else str(wait)))


main()
