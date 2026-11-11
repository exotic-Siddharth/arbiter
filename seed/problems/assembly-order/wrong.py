import heapq
import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, m = int(data[0]), int(data[1])
    code = [0] * (n + 1)
    task_of = [0] * (n + 1)
    for i in range(1, n + 1):
        c = int(data[1 + i])
        code[i] = c
        task_of[c] = i
    adj = [[] for _ in range(n + 1)]
    indeg = [0] * (n + 1)
    pos = 2 + n
    for _ in range(m):
        a, b = int(data[pos]), int(data[pos + 1])
        pos += 2
        if a == b:
            continue
        adj[a].append(b)
        indeg[b] += 1
    heap = [code[i] for i in range(1, n + 1) if indeg[i] == 0]
    heapq.heapify(heap)
    order = []
    done = [False] * (n + 1)
    while heap:
        u = task_of[heapq.heappop(heap)]
        order.append(u)
        done[u] = True
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                heapq.heappush(heap, code[v])
    if len(order) == n:
        sys.stdout.write(" ".join(map(str, order)) + "\n")
    else:
        stuck = [i for i in range(1, n + 1) if not done[i]]
        sys.stdout.write(f"CYCLE {len(stuck)}\n" + " ".join(map(str, stuck)) + "\n")


main()
