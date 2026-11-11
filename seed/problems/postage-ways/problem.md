The post office in Fennick Cross sells stamps in $n$ different **designs**. Design $i$ has a face value of $v_i$ pence. Two designs may share a face value (the lighthouse and the puffin both cost $3$ pence), but they are still different designs.

Most designs are *regular*: the counter has an endless supply of them. Some designs are *commemorative*: the clerk has only one sheet left, and a single parcel may carry **at most one** stamp of each commemorative design.

A customer asks: "in how many ways can I pay a postage of exactly $P$ pence?" A way is a collection of stamps whose face values add up to exactly $P$; the order in which the stamps are stuck on does not matter, so two ways differ only if some design is used a different number of times. Paying $P = 0$ is possible in exactly one way: use no stamps.

The customers ask $q$ such questions. Since the counts grow very quickly, give each answer modulo $10^9 + 7$.

## Input

The first line contains two integers $n$ and $q$.

The second line contains $n$ integers $v_1, v_2, \ldots, v_n$.

The third line contains a string of $n$ characters: its $i$-th character is `R` if design $i$ is regular and `C` if it is commemorative.

The fourth line contains $q$ integers $P_1, P_2, \ldots, P_q$.

## Output

Print $q$ lines. The $j$-th line contains the number of ways to pay exactly $P_j$ pence, modulo $10^9 + 7$.

## Constraints

- $1 \le n \le 60$
- $1 \le q \le 10^5$
- $1 \le v_i \le 10^5$
- $0 \le P_j \le 5 \cdot 10^4$
- The third line has exactly $n$ characters, each `R` or `C`.
