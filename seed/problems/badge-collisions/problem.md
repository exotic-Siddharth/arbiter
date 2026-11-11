The Northgate developer summit prints a badge for every attendee at the door. Each attendee arrives with a badge code from their ticket, and a volunteer types it into the printing kiosk. The volunteers were not consistent: some typed letters in lower case, and some kept the hyphens that the tickets use to group characters, while others left them out.

The kiosk treats two typed codes as the **same badge** when they are equal after two clean-up steps: every hyphen `-` is removed, and every lower-case letter is turned into upper case. So `ab-12`, `AB12` and `a-b-1-2` are all the same badge, while `AB12` and `AB21` are not.

When two people print the same badge, the organisers call it a *collision*. For every attendee, in order of arrival, the organisers want to know how many people who arrived **earlier** printed the same badge. At the end of the day they also want the number of distinct badges that were printed and the total number of colliding pairs, that is, the number of unordered pairs of attendees who printed the same badge.

## Input

The first line contains an integer $n$, the number of attendees.

Each of the next $n$ lines contains one typed code $s_i$, in order of arrival. A code consists of upper-case letters, lower-case letters, digits and hyphens, and contains at least one character that is not a hyphen.

## Output

Print two lines.

The first line contains $n$ integers separated by single spaces: the $i$-th integer is the number of indices $j < i$ such that $s_j$ and $s_i$ are the same badge. The first attendee always gets $0$.

The second line contains two integers: the number of distinct badges among all $n$ codes, and the number of unordered pairs $\{i, j\}$ with $i \ne j$ whose codes are the same badge.

## Constraints

- $1 \le n \le 10^5$
- $1 \le |s_i| \le 8$
- Each $s_i$ uses only the characters `A`-`Z`, `a`-`z`, `0`-`9` and `-`, and at least one of its characters is not `-`.
- The number of colliding pairs can exceed $2^{31} - 1$; use 64-bit integers.
