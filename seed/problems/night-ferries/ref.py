import heapq
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, m, k = int(data[0]), int(data[1]), int(data[2])
    adj = [[] for _ in range(n + 1)]
    pos = 3
    for _ in range(m):
        u, v, f, p, c = (int(x) for x in data[pos:pos + 5])
        pos += 5
        adj[u].append((v, f, p, c))
    layers = k + 1
    inf = float("inf")
    # dist[node * layers + used]: earliest minute in node after using `used` tickets.
    # Waiting never makes a later departure possible earlier (FIFO), so Dijkstra applies.
    dist = [inf] * ((n + 1) * layers)
    dist[1 * layers] = 0
    heap = [(0, 1 * layers)]
    while heap:
        t, state = heapq.heappop(heap)
        if t > dist[state]:
            continue
        u, used = divmod(state, layers)
        if u == n:
            continue
        for v, f, p, c in adj[u]:
            # next scheduled boat at or after minute t
            depart = f if t <= f else f + -((f - t) // p) * p
            arrive = depart + c
            s = v * layers + used
            if arrive < dist[s]:
                dist[s] = arrive
                heapq.heappush(heap, (arrive, s))
            if used < k:
                arrive = t + c
                s += 1
                if arrive < dist[s]:
                    dist[s] = arrive
                    heapq.heappush(heap, (arrive, s))
    answers = []
    best = inf
    for used in range(layers):
        best = min(best, dist[n * layers + used])
        answers.append(-1 if best == inf else best)
    sys.stdout.write(" ".join(map(str, answers)) + "\n")


main()
