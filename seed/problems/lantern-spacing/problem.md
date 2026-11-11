For the autumn lantern festival, Quay Street has $n$ hooks along the harbour wall. Hook $i$ is $x_i$ metres from the start of the street, and no two hooks are at the same place.

Some hooks are **reserved**: the mayor's own lanterns already hang there and will not be moved. The festival committee will add lanterns on other hooks so that in the end **exactly $k$ hooks** carry a lantern, the reserved ones included. Every hook carries at most one lantern.

Lanterns that hang too close together melt each other's paper shades, so the committee wants the two closest lanterns to be as far apart as possible. Find the largest possible value of the smallest distance between two lanterns.

If there are more than $k$ reserved hooks, the plan cannot be carried out; print $-1$ in that case.

## Input

The first line contains two integers $n$ and $k$.

The second line contains $n$ integers $x_1, x_2, \ldots, x_n$: the hook positions, in no particular order.

The third line contains a string of $n$ characters, each `0` or `1`. Its $i$-th character is `1` if hook $i$ (the hook at position $x_i$) is reserved and `0` otherwise.

## Output

Print one integer: the largest achievable minimum distance between two of the $k$ lanterns, or $-1$ if more than $k$ hooks are reserved.

## Constraints

- $2 \le k \le n \le 8 \cdot 10^4$
- $0 \le x_i \le 10^9$, and all $x_i$ are distinct.
- The third line has exactly $n$ characters, each `0` or `1`; any number of them, from none to all, may be `1`.
