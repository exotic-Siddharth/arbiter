/** Lines of program output, ignoring trailing spaces and trailing blank lines. */
export function outputLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** Index of each line that differs between expected and actual output. */
export function changedLines(expected: readonly string[], actual: readonly string[]): Set<number> {
  const changed = new Set<number>();
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (expected[index] !== actual[index]) changed.add(index);
  }
  return changed;
}
