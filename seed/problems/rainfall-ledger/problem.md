The weather station on Brannock Fell has kept a rainfall ledger for $n$ consecutive days. Day $i$ has one entry $r_i$: the rain that fell that day, in tenths of a millimetre. A day with $r_i = 0$ is a *dry day*.

Hydrologists from the valley send the station $q$ questions. Each question names two days $a$ and $b$ and asks about the **stretch** of days between them, both ends included. The hydrologists are careless about order, so $a$ may be smaller than, equal to or greater than $b$: the stretch is always the days from $\min(a, b)$ to $\max(a, b)$.

For every question, report the total rainfall over the stretch and the number of dry days in it.

## Input

The first line contains an integer $n$, the number of days.

The second line contains $n$ integers $r_1, r_2, \ldots, r_n$.

The third line contains an integer $q$, the number of questions.

Each of the next $q$ lines contains two integers $a$ and $b$.

## Output

For each question, in the order given, print one line with two integers: the total rainfall $\sum_{i=\min(a,b)}^{\max(a,b)} r_i$ and the number of dry days in the stretch.

## Constraints

- $1 \le n \le 10^5$
- $0 \le r_i \le 10^4$
- $1 \le q \le 2.5 \cdot 10^4$
- $1 \le a, b \le n$
