Ines is training for the Riverside half marathon. Her watch splits every run into $n$ segments, and for segment $i$ it records the distance $d_i$ in metres and the time $t_i$ in seconds. The *pace* of a stretch of running is the time it takes per kilometre, measured in **minutes per kilometre**: a stretch of $D$ metres run in $T$ seconds has pace

$$\frac{T / 60}{D / 1000}.$$

Her coach does not trust the extremes: a downhill sprint or a stop at a traffic light says little about her form. So the coach computes a *trimmed pace*:

- if $n \ge 3$, the **fastest** segment (the one with the smallest pace $t_i / d_i$) is discarded first, and then the **slowest** of the remaining segments (the largest pace $t_i / d_i$) is discarded. When several segments tie for fastest, the one with the smallest index is discarded; the same rule picks the slowest among the remaining segments;
- if $n \le 2$, nothing is discarded.

The trimmed pace is the pace of the kept segments taken together: their total time divided by their total distance, converted to minutes per kilometre as above. Note that this is **not** the average of the individual segment paces when the segments have different lengths.

Compute the trimmed pace of the run.

## Input

The first line contains an integer $n$, the number of segments.

Each of the next $n$ lines contains two integers $d_i$ and $t_i$.

## Output

Print one real number: the trimmed pace in minutes per kilometre. Your answer is accepted if its absolute or relative error is at most $10^{-6}$. Printing it with at least $9$ digits after the decimal point is enough.

## Constraints

- $1 \le n \le 6 \cdot 10^4$
- $1 \le d_i \le 10^5$
- $1 \le t_i \le 10^6$
