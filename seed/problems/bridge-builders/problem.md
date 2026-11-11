The Serrano archipelago has $n$ islands, numbered from $1$ to $n$, and at the start no island is connected to any other. A team of engineers builds footbridges, one per day. Each bridge joins two different islands, and it can be walked in both directions.

Two islands belong to the same *group* when you can walk from one to the other using the bridges built so far, possibly crossing other islands on the way. Every island belongs to exactly one group, so at the start there are $n$ groups of one island each.

The engineers have a limited budget, and the ministry wants to know how well it is spent. A bridge is *wasted* if, on the day it is built, its two islands were already in the same group (for example, a second bridge between the same two islands is always wasted).

After every day, report three numbers: the number of groups, the number of islands in the largest group, and the total number of wasted bridges built so far.

## Input

The first line contains two integers $n$ and $m$: the number of islands and the number of days.

Each of the next $m$ lines contains two integers $a_i$ and $b_i$: on day $i$ a bridge is built between islands $a_i$ and $b_i$.

## Output

Print $m$ lines. Line $i$ contains three integers separated by single spaces, describing the archipelago right after the bridge of day $i$ is built: the number of groups, the size of the largest group, and the number of wasted bridges among days $1, \dots, i$.

## Constraints

- $2 \le n \le 10^5$
- $1 \le m \le 8 \cdot 10^4$
- $1 \le a_i, b_i \le n$ and $a_i \ne b_i$
- The same pair of islands may appear on several days, in either order.
