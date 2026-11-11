A toy workshop builds a model railway kit from $n$ numbered tasks. Some tasks cannot start until others are done: a rule `a b` means task $a$ must be finished before task $b$ can start. The same rule may appear several times, and a rule may even name one task twice (`a a`), which means the task waits for itself.

Every task produces a part with a *part code*. The codes $c_1, \dots, c_n$ are all different. Tasks are done one at a time. The foreman records the codes in the order the tasks are finished and wants this written sequence of codes to be the smallest possible when compared like words in a dictionary: the first position where two orders differ decides, and the order with the smaller code there wins.

If the rules allow a valid order for all $n$ tasks, print the tasks in the order with the smallest code sequence. If they do not (some tasks wait on each other in a circle), the workshop reports the problem instead. Tasks that can still be done by following the rules are not a problem, but a task is *stuck* when no order can ever finish it: that is every task on such a circle, and every task that has to wait, directly or through other tasks, for a stuck task.

## Input

The first line contains two integers $n$ and $m$: the number of tasks and the number of rules.

The second line contains $n$ integers $c_1, \dots, c_n$: the part codes. They are a permutation of $1, 2, \dots, n$.

Each of the next $m$ lines contains two integers $a$ and $b$: the rule "task $a$ before task $b$".

## Output

If all $n$ tasks can be finished, print one line with $n$ integers separated by single spaces: the task numbers (not the codes) in the order in which they are finished, chosen so that the sequence of their part codes is the smallest possible.

Otherwise print the word `CYCLE` and the number $s$ of stuck tasks, separated by a space, on the first line, and on the second line the $s$ stuck task numbers in increasing order, separated by single spaces.

## Constraints

- $1 \le n \le 4 \cdot 10^4$
- $0 \le m \le 5 \cdot 10^4$
- $1 \le a, b \le n$; $a = b$ is allowed
- $c$ is a permutation of $1..n$

## Notes

The rule set may be empty. A task with a rule `a a` is stuck, and so is everything that waits for it. If the answer is `CYCLE`, no order of the other tasks is printed.
