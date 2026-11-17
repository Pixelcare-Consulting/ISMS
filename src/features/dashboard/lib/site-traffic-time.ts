function toEpochMs(value: Date | string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/**
 * Relative label for a fixed clock. Callers must pass `now` — this never
 * reads the current time, so the same inputs always return the same text.
 */
export function formatSiteTrafficRelativeTime(
  value: Date | string | number,
  now: Date | string | number,
): string {
  const seenMs = toEpochMs(value);
  const nowMs = toEpochMs(now);
  if (seenMs == null || nowMs == null) return "—";

  const sec = Math.max(0, Math.floor((nowMs - seenMs) / 1000));
  if (sec < 60) return plural(sec, "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return plural(min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 48) return plural(hr, "hour");
  return plural(Math.floor(hr / 24), "day");
}
