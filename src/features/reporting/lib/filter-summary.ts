/** Human-readable filter line printed in report headers. */
export function describeDateRange(from?: string, to?: string): string {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return "All dates";
}
