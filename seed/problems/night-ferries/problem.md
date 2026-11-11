The islands of the Morrow Sound are linked by night ferries. There are $n$ ports, numbered from $1$ to $n$, and $m$ ferry lines. Line $i$ sails one way only, from port $u_i$ to port $v_i$. Its first boat leaves at minute $f_i$, and after that a boat leaves every $p_i$ minutes, so boats of line $i$ leave port $u_i$ exactly at the minutes $f_i, f_i + p_i, f_i + 2p_i, \dots$ Every crossing of line $i$ takes $c_i$ minutes.

A courier stands in port $1$ at minute $0$ and must reach port $n$ as early as possible. She may wait in any port for as long as she likes. If she is in port $u_i$ at a minute when a boat of line $i$ leaves, she can board it, including when she arrived at that very minute.

The courier also carries up to $K$ *charter tickets*. A charter ticket can be used in port $u_i$ at any minute to hire a private boat on line $i$: it leaves at once, without waiting for the timetable, and also takes $c_i$ minutes to reach $v_i$. Each ticket can be used once.

The dispatcher wants to know how much the tickets are worth, so for every $j$ from $0$ to $K$ she asks: what is the earliest minute at which the courier can reach port $n$ if she uses at most $j$ charter tickets?

## Input

The first line contains three integers $n$, $m$ and $K$.

Each of the next $m$ lines contains five integers $u_i$, $v_i$, $f_i$, $p_i$ and $c_i$, describing ferry line $i$.

## Output

Print $K + 1$ integers separated by single spaces. The $j$-th of them (counting from $0$) is the earliest minute at which the courier can be in port $n$ using at most $j$ charter tickets, or $-1$ if port $n$ cannot be reached at all.

## Constraints

- $2 \le n \le 2 \cdot 10^4$
- $1 \le m \le 3 \cdot 10^4$
- $0 \le K \le 3$
- $1 \le u_i, v_i \le n$ and $u_i \ne v_i$
- $0 \le f_i \le 10^6$
- $1 \le p_i \le 10^4$
- $1 \le c_i \le 10^4$
- Several lines may connect the same pair of ports. The answers can exceed $2^{31} - 1$; use 64-bit integers.

## Notes

If port $n$ cannot be reached without tickets, it cannot be reached with them either, because a ticket only lets a boat of an existing line leave earlier. So either all $K + 1$ answers are $-1$ or none is. The answers never increase as $j$ grows.
