/** Whole calendar days between `from` and `to` (floored, never negative). */
export function wholeDaysBetween(from: Date, to: Date = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}
