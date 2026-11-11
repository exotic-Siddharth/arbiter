import sys


def main():
    data = sys.stdin.buffer.read().split()
    n, k = int(data[0]), int(data[1])
    flags = data[2 + n]
    hooks = sorted((int(data[2 + i]), flags[i] == 49) for i in range(n))  # 49 == ord("1")
    xs = [x for x, _ in hooks]
    reserved = [r for _, r in hooks]
    reserved_xs = [x for x, r in hooks if r]
    if len(reserved_xs) > k:
        print(-1)
        return
    # next_res[i]: position of the first reserved hook at index > i (or a far sentinel).
    far = 1 << 62
    next_res = [far] * n
    nxt = far
    for i in range(n - 1, -1, -1):
        next_res[i] = nxt
        if reserved[i]:
            nxt = xs[i]
    # Gaps between consecutive reserved hooks bound the answer from above.
    hi = (xs[-1] - xs[0]) // (k - 1)
    for a, b in zip(reserved_xs, reserved_xs[1:]):
        hi = min(hi, b - a)

    hooks_info = list(zip(xs, reserved, next_res))

    def can(g):
        """Can at least k lanterns hang with all gaps >= g, reserved hooks included?
        Greedy: take every reserved hook, and an optional hook as early as possible when it
        keeps distance g from the previous lantern and from the next reserved hook. Gaps
        between reserved hooks are >= g because g <= hi. Reaching k early is enough: the
        hooks still to come would only add lanterns."""
        reach = -far  # the next lantern must be at least here
        count = 0
        for x, res, nr in hooks_info:
            if res or (x >= reach and nr - x >= g):
                count += 1
                if count >= k:
                    return True
                reach = x + g
        return False

    lo = 1  # always achievable: the hooks are distinct and len(reserved) <= k <= n
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if can(mid):
            lo = mid
        else:
            hi = mid - 1
    print(lo)


main()
