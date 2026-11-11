A water utility monitors a long underground pipeline with $n$ pressure sensors, numbered $1$ to $n$ from the pumping station downstream. Sensor $i$ shows a reading $a_i$. Readings change over time, and the control room keeps a log of operations that must be answered in order. There are three kinds:

- **Update** `1 i v`: sensor $i$ now shows the reading $v$ (it replaces the old reading).
- **Survey** `2 l r`: the engineers inspect the stretch from sensor $l$ to sensor $r$, inclusive, and want the total of the readings $a_l + a_{l+1} + \dots + a_r$ and the highest reading $\max(a_l, \dots, a_r)$ on that stretch.
- **Alarm** `3 l x`: a crew stands at sensor $l$ and walks downstream. They want the number of the first sensor $j \ge l$ whose reading satisfies $a_j \ge x$, so that they know where to stop. If no sensor from $l$ to $n$ reaches $x$, the answer is $-1$.

## Input

The first line contains two integers $n$ and $q$: the number of sensors and the number of operations.

The second line contains $n$ integers $a_1, a_2, \dots, a_n$: the initial readings.

Each of the next $q$ lines contains one operation in one of the three forms above: `1 i v`, `2 l r` or `3 l x`.

## Output

For every survey, print one line with two integers separated by a space: the total and the highest reading on the stretch.

For every alarm, print one line with one integer: the number of the first sensor $j \ge l$ with $a_j \ge x$, or $-1$ if there is none.

Updates print nothing. Answer the operations in the order they are given, each one taking all earlier updates into account.

## Constraints

- $1 \le n \le 4 \cdot 10^4$
- $1 \le q \le 4 \cdot 10^4$
- $0 \le a_i, v, x \le 10^6$
- $1 \le i \le n$, $1 \le l \le r \le n$ for surveys, and $1 \le l \le n$ for alarms
- At least one operation is a survey or an alarm.
- A total can exceed $2^{31} - 1$; use 64-bit integers.
