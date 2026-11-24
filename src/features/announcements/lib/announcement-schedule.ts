/**
 * Published at and Expires at are Philippines wall-clock times.
 * The form sends `datetime-local` (`YYYY-MM-DDTHH:mm`) with no zone.
 * Asia/Manila is UTC+8 year-round, so the offset is fixed.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM-DDTHH:mm` or with seconds, and no zone suffix. */
const DATE_TIME_LOCAL = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/;

const HAS_EXPLICIT_ZONE = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

/**
 * `YYYY-MM-DDTHH:mm` in Manila for a datetime-local input.
 * Absolute instants (Date or ISO with a zone) are shifted to Manila.
 * A zone-less clock string is already the wall time and is returned as-is.
 */
export function announcementDateTimeLocalValue(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const local = DATE_TIME_LOCAL.exec(trimmed);
    if (local && !HAS_EXPLICIT_ZONE.test(trimmed)) return local[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/**
 * Reads a form clock as Asia/Manila, whatever zone the server runs in.
 * A Date, or a string that already has `Z` or an offset, stays that instant.
 * Returns null when the value is empty or not a real calendar time.
 */
export function parseAnnouncementDateTime(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (HAS_EXPLICIT_ZONE.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const local = DATE_TIME_LOCAL.exec(trimmed);
  if (!local) return null;

  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  const date = new Date(`${withSeconds}+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  // Date rolls 31 February forward instead of rejecting it.
  if (announcementDateTimeLocalValue(date) !== local[1]) return null;
  return date;
}

/**
 * Same window as the Dashboard Overview query: already published, not yet expired.
 * `publishedAt` equal to now is included. `expiresAt` equal to now is not.
 */
export function isAnnouncementOnOverviewFeed(
  row: {
    isActive: boolean;
    publishedAt: Date;
    expiresAt?: Date | null;
  },
  now: Date,
): boolean {
  if (!row.isActive) return false;
  if (row.publishedAt.getTime() > now.getTime()) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
