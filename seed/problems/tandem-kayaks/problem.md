Saltmarsh Paddle Club rents out tandem kayaks for its Sunday crossing. A tandem kayak carries exactly two paddlers, and the boat is rated for a combined load of at most $C$ kilograms. A pair of paddlers is *safe* if the sum of their two weights is **at most** $C$; a sum exactly equal to $C$ is still safe.

This week $n$ members signed up, and member $i$ weighs $w_i$ kilograms. Before drawing lots for the crews, the club secretary wants two numbers:

1. how many different unordered pairs of members form a safe crew (two members with the same weight are still different people, and nobody can pair with themselves);
2. the heaviest combined weight among all safe pairs, which tells the club how close to the rating a crew may get.

If no pair is safe (including the case of a single sign-up), the heaviest combined weight is reported as $-1$.

## Input

The first line contains two integers $n$ and $C$.

The second line contains $n$ integers $w_1, w_2, \ldots, w_n$.

## Output

Print two integers separated by a space: the number of safe unordered pairs, and the heaviest combined weight of a safe pair, or $-1$ if there is none.

## Constraints

- $1 \le n \le 10^5$
- $1 \le C \le 2 \cdot 10^6$
- $1 \le w_i \le 10^6$
- The number of safe pairs can exceed $2^{31} - 1$; use 64-bit integers.
