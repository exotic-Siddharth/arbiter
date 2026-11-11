/** Horizontal rule with a centred "or" between a primary form action and an alternative. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-border" />
      <span aria-hidden="true">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
