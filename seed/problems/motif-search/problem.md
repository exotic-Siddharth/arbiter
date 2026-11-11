A museum restorer is cataloguing an old glass necklace. It is a closed loop of $n$ beads, and each bead carries an engraved capital letter. She wrote the letters down going clockwise, starting from the clasp, which gives a string $T = t_1 t_2 \dots t_n$: bead $1$ is next to the clasp, bead $i + 1$ follows bead $i$ clockwise, and bead $1$ follows bead $n$ again.

An old inventory describes a *motif* $P$ of $m$ letters that is supposed to appear on the necklace. Nobody knows which way the necklace was held when the inventory was written, so the motif may appear in either direction.

Bead $i$ is a *motif start* if reading $m$ consecutive beads clockwise from bead $i$ (bead $i$ included, wrapping past bead $n$ back to bead $1$ when needed) gives exactly $P$, or gives exactly $P$ written backwards. A bead that satisfies both conditions is still counted once.

Find how many beads are motif starts, and the smallest bead number among them.

## Input

The first line contains the string $T$.

The second line contains the string $P$.

## Output

Print two integers separated by a space: the number of motif starts, and the smallest bead number that is a motif start. If there is no motif start, print `0 -1`.

## Constraints

- $1 \le m \le n \le 2 \cdot 10^5$, where $n = |T|$ and $m = |P|$
- $T$ and $P$ consist of the capital letters `A`-`Z` only.

## Notes

When $m = n$, the reading from bead $i$ covers the whole necklace once, so bead $i$ is a motif start exactly when the necklace, read clockwise from bead $i$, is $P$ or its reverse.
