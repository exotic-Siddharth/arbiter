# Bug: reads the answer for j from the layer "exactly j tickets used" instead of taking the
# best over 0..j tickets. When the best route has fewer than j crossings, all j tickets cannot
# be spent on it, so the program reports a later minute (or -1). Both samples have routes with
# at least K crossings, so it passes them.
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
    dist = [inf] * ((n + 1) * layers)
    dist[layers] = 0
    heap = [(0, layers)]
    while heap:
        t, state = heapq.heappop(heap)
        if t > dist[state]:
            continue
        u, used = divmod(state, layers)
        if u == n:
            continue
        for v, f, p, c in adj[u]:
            depart = f if t <= f else f + -((f - t) // p) * p
            s = v * layers + used
            if depart + c < dist[s]:
                dist[s] = depart + c
                heapq.heappush(heap, (depart + c, s))
            if used < k and t + c < dist[s + 1]:
                dist[s + 1] = t + c
                heapq.heappush(heap, (t + c, s + 1))
    answers = [dist[n * layers + used] for used in range(layers)]
    sys.stdout.write(" ".join("-1" if a == inf else str(a) for a in answers) + "\n")


main()
