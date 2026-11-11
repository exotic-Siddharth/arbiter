The Calder Archive keeps its oldest scrolls in cases nested inside other cases: a scroll may sit in a sleeve, inside a tube, inside a box, inside a chest. While packing a shelf, the cataloguer writes a *shelf log*, one symbol per action:

| Case | Opened | Closed |
|---|---|---|
| tube | `(` | `)` |
| box | `[` | `]` |
| chest | `{` | `}` |
| sleeve | `<` | `>` |

Opening a case puts it inside the case that is currently open, if any. A closing symbol always closes the **most recently opened case that is still open**, and the symbol must name that same kind of case.

A log is *sound* when every closing symbol closes a case of its own kind and no case is left open at the end. Its *depth* is the largest number of cases that are open at the same moment.

The archive's checker reads logs from left to right and reports the first problem it meets:

- a closing symbol when no case is open, or a closing symbol of the wrong kind, is a **mismatch** at that symbol;
- if the whole log is read without a mismatch but some cases are still open, the log is **unclosed**, and the checker points at the **outermost** case still open, that is, the earliest-opened case that was never closed, since that is the case whose lid the cataloguer forgot first.

Write the checker.

## Input

The first line contains an integer $t$, the number of logs.

Each of the next $t$ lines contains one log $s$: a non-empty string of the symbols `(`, `)`, `[`, `]`, `{`, `}`, `<` and `>`.

## Output

For each log, print one line:

- `OK d` if the log is sound, where $d$ is its depth;
- `MISMATCH p` if a mismatch happens, where $p$ is the 1-based position of the first mismatching symbol;
- `UNCLOSED p` if there is no mismatch but cases remain open, where $p$ is the 1-based position of the opening symbol of the outermost case that is still open.

## Constraints

- $1 \le t \le 10^4$
- Every log has length at least $1$, and the total length of all logs is at most $9 \cdot 10^5$.
- Each log uses only the eight symbols listed above.
