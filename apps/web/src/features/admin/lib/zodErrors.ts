/** The part of a ZodError used here (zod is a dependency of @arbiter/shared, not of the web). */
interface IssueList {
  issues: readonly { path: readonly (string | number)[]; message: string }[];
}

/** First message per dot-joined path ("problems.1.label"), like fieldErrors() for API errors. */
export function zodFieldErrors(error: IssueList): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!(path in result)) result[path] = issue.message;
  }
  return result;
}
