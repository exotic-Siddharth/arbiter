# Bug: for an unclosed log it reports the innermost open case (top of the stack)
# instead of the outermost one. Both samples leave at most one case open, so it passes them.
import sys

OPENER = {ord(")"): ord("("), ord("]"): ord("["), ord("}"): ord("{"), ord(">"): ord("<")}


def check(log):
    stack = []
    depth = 0
    for i, ch in enumerate(log):
        want = OPENER.get(ch)
        if want is None:
            stack.append(i)
            depth = max(depth, len(stack))
        elif stack and log[stack[-1]] == want:
            stack.pop()
        else:
            return "MISMATCH %d" % (i + 1)
    if stack:
        return "UNCLOSED %d" % (stack[-1] + 1)
    return "OK %d" % depth


def main():
    data = sys.stdin.buffer.read().split()
    t = int(data[0])
    sys.stdout.write("\n".join(check(log) for log in data[1:t + 1]) + "\n")


main()
