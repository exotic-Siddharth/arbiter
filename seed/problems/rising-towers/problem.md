The harbour city of Velmora is putting up a row of towers along its seafront promenade. The towers are built one at a time, from the west end to the east end, so tower $i$ always stands east of towers $1, \dots, i-1$.

A local photographer wants a *staircase shot*: she picks some of the towers and photographs them from the west, so that every picked tower is **at least $d$ metres taller** than the picked tower just west of it. A single tower on its own is a staircase of length $1$. Towers that are not picked do not matter, whatever their height.

The photographer does not want to wait for the whole promenade to be finished. After each new tower is completed, she asks the planning office for the length of the longest staircase that can be formed from the towers built so far.

## Input

The first line contains two integers $n$ and $d$: the number of towers and the minimum rise between two consecutive picked towers.

The second line contains $n$ integers $h_1, h_2, \dots, h_n$: the heights of the towers in the order they are built, from west to east.

## Output

Print $n$ integers separated by single spaces on one line. The $i$-th integer is the largest $k$ such that there are indices $j_1 < j_2 < \dots < j_k \le i$ with $h_{j_{t+1}} - h_{j_t} \ge d$ for every $t$ from $1$ to $k-1$.

## Constraints

- $1 \le n \le 10^5$
- $0 \le d \le 10^9$
- $1 \le h_i \le 10^9$

## Notes

When $d = 0$, two picked towers next to each other in the staircase may have equal heights. When $d \ge 1$, every picked tower must be strictly taller than the previous one, by $d$ metres or more. The first printed integer is always $1$.
