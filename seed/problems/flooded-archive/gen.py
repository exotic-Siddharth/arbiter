"""Hidden tests for flooded-archive. Usage: python gen.py <tests_dir> (writes 03.in and up)."""
import random
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
MAX = 600


def write(number, grid):
    r, c = len(grid), len(grid[0])
    assert 1 <= r <= MAX and 1 <= c <= MAX and r * c >= 2 and all(len(row) == c for row in grid)
    text = "".join(grid)
    assert text.count("S") == 1 and text.count("E") >= 1 and set(text) <= set("#.WSE")
    with open(OUT / f"{number:02d}.in", "w", newline="\n") as f:
        f.write(f"{r} {c}\n" + "\n".join(grid) + "\n")


def random_grid(rng, r, c, wall_share, water, exits):
    cells = [["#" if rng.random() < wall_share else "." for _ in range(c)] for _ in range(r)]
    spots = rng.sample(range(r * c), 1 + water + exits)
    marks = ["S"] + ["W"] * water + ["E"] * exits
    for spot, mark in zip(spots, marks):
        cells[spot // c][spot % c] = mark
    return ["".join(row) for row in cells]


def max_wait(grid):
    """Largest safe waiting time (-1 if none, None for FOREVER); used to pick interesting grids."""
    r, c = len(grid), len(grid[0])
    inf = 1 << 60

    def bfs(sources, blocked):
        dist = [[inf] * c for _ in range(r)]
        frontier = list(sources)
        for i, j in frontier:
            dist[i][j] = 0
        level = 0
        while frontier:
            level += 1
            nxt = []
            for i, j in frontier:
                for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                    if 0 <= a < r and 0 <= b < c and grid[a][b] not in blocked and dist[a][b] == inf:
                        dist[a][b] = level
                        nxt.append((a, b))
            frontier = nxt
        return dist

    cells = [(i, j) for i in range(r) for j in range(c)]
    flood = bfs([p for p in cells if grid[p[0]][p[1]] == "W"], "#")
    dist = bfs([p for p in cells if grid[p[0]][p[1]] == "S"], "#W")
    best = -1
    for i, j in cells:
        if grid[i][j] == "E" and dist[i][j] < inf:
            if flood[i][j] == inf:
                return None
            best = max(best, flood[i][j] - dist[i][j] - 1)
    return best


def main():
    rng = random.Random(6006)
    # 03: the smallest basement: step straight out, no water at all.
    write(3, ["SE"])
    # 04: the water source sits between the archivist and the only exit.
    write(4, ["SWE"])
    # 05: the only exit is sealed off by walls.
    grid = random_grid(rng, 30, 40, 0.2, 3, 0)
    rows = [list(row) for row in grid]
    for i in range(10, 15):
        for j in range(20, 25):
            rows[i][j] = "#"
    rows[12][22] = "E"
    write(5, ["".join(row) for row in rows])
    # 06: near-max random basement with walls, a few sources and exits, where the
    # archivist can get out and still has at least 5 minutes to spare.
    while True:
        grid = random_grid(rng, MAX, MAX - 1, 0.3, 5, 3)
        wait = max_wait(grid)
        if wait is not None and wait >= 5:
            break
    write(6, grid)
    # 07: open floor, a source right next to the archivist: they can leave but not wait.
    rows = [["."] * MAX for _ in range(MAX - 1)]
    rows[299][300] = "S"
    rows[299][299] = "W"
    rows[0][MAX - 1] = "E"
    rows[MAX - 2][MAX - 1] = "E"
    write(7, ["".join(row) for row in rows])
    # 08: max size snake corridor (the largest input). Water starts at the head of the
    # corridor, the archivist 400 cells further along and the exit at the far end: the
    # answer to the second question is 399 (worst case for simulating every wait).
    rows = []
    for i in range(MAX):
        if i % 2 == 0:
            rows.append(["."] * MAX)
        else:
            row = ["#"] * MAX
            row[MAX - 1 if (i // 2) % 2 == 0 else 0] = "."
            rows.append(row)
    path = []
    for band in range(MAX // 2):
        cols = range(MAX) if band % 2 == 0 else range(MAX - 1, -1, -1)
        path += [(2 * band, j) for j in cols]
    rows[path[0][0]][path[0][1]] = "W"
    rows[path[400][0]][path[400][1]] = "S"
    rows[path[-1][0]][path[-1][1]] = "E"
    write(8, ["".join(row) for row in rows])
    # 09: near-max, many sources and many exits, and a way out.
    while True:
        grid = random_grid(rng, MAX, MAX - 1, 0.2, 40, 150)
        wait = max_wait(grid)
        if wait is not None and wait >= 0:
            break
    write(9, grid)
    # 10: near-max, no water at all: either FOREVER or no way out.
    write(10, random_grid(rng, MAX - 1, MAX, 0.1, 0, 2))
    # 11: archivist and water reach the exit in the same minute: not allowed.
    write(11, ["S..E..W"])
    # 12: one minute to spare: leaving at once works, waiting one minute does not.
    write(12, ["S..E...W"])
    # 13: medium random basement with a way out.
    while True:
        grid = random_grid(rng, 50, 80, 0.25, 4, 6)
        wait = max_wait(grid)
        if wait is not None and wait >= 0:
            break
    write(13, grid)


main()
