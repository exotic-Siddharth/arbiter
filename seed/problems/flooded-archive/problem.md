A burst main is flooding the basement of the city archive. The basement is a grid of $r$ rows and $c$ columns, and every cell is one of:

- `#`: a wall or a solid shelf, which neither water nor people can enter;
- `.`: open floor;
- `W`: a spot where water is pouring in;
- `S`: where the archivist is standing (open floor, exactly one such cell);
- `E`: a stairway out of the basement (open floor, at least one such cell).

Water starts at every `W` cell at minute $0$. Every minute it spreads from each wet cell into the up to four cells that share a side with it, unless they are walls. So a cell becomes wet at minute $f$, where $f$ is the smallest number of side-steps from any `W` cell to it that avoid walls; a cell that water can never reach stays dry forever. A cell that becomes wet at minute $f$ is wet at every minute from $f$ on.

The archivist wants to rescue a box of records before leaving. They may stay at `S` packing for $w$ whole minutes ($w \ge 0$), and then leave at minute $w$. From then on they **must move every minute**: during each minute they step into a side-adjacent cell that is not a wall. The archivist may never stand in a wet cell: they must be at a dry `S` at minute $w$, and if they step into a cell at minute $m$, that cell must still be dry at minute $m$, which means water reaches it strictly later than $m$. As soon as they step onto any `E` cell, they are out.

Answer two questions:

1. If the archivist leaves immediately ($w = 0$), what is the earliest minute at which they can be out? Print $-1$ if they cannot get out at all.
2. What is the largest $w$ for which they can still get out? Print $-1$ if they cannot get out even with $w = 0$, and print `FOREVER` if they can get out after waiting any number of minutes.

## Input

The first line contains two integers $r$ and $c$.

Each of the next $r$ lines contains a string of $c$ characters from `#`, `.`, `W`, `S` and `E`.

## Output

Print two lines: the answer to the first question, then the answer to the second question.

## Constraints

- $1 \le r, c \le 600$ and $r \cdot c \ge 2$
- The grid contains exactly one `S`, at least one `E`, and any number of `W` (possibly none).
