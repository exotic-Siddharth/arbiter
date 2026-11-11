import sys

# Byte code of each closing symbol -> byte code of its opening symbol.
OPENER = {ord(")"): ord("("), ord("]"): ord("["), ord("}"): ord("{"), ord(">"): ord("<")}


def check(log):
    stack = []  # positions (0-based) of the open cases, innermost last
    depth = 0
    for i, ch in enumerate(log):
        want = OPENER.get(ch)
        if want is None:
            stack.append(i)
            if len(stack) > depth:
                depth = len(stack)
        elif stack and log[stack[-1]] == want:
            stack.pop()
        else:
            return "MISMATCH %d" % (i + 1)
    if stack:
        return "UNCLOSED %d" % (stack[0] + 1)
    return "OK %d" % depth


def main():
    data = sys.stdin.buffer.read().split()
    t = int(data[0])
    sys.stdout.write("\n".join(check(log) for log in data[1:t + 1]) + "\n")


main()
