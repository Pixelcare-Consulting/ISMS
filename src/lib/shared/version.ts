import packageJson from "../../../package.json";

import { RELEASES, type ReleaseNote } from "@/content/releases";

export const APP_VERSION = packageJson.version;

export function formatVersionLabel(version = APP_VERSION): string {
  return `v${version}`;
}

export function formatReleaseDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");

  if (!year || !month || !day) {
    return isoDate;
  }

  return `${day}.${month}.${year.slice(-2)}`;
}

/** Parses a YYYY-MM-DD release date as a local calendar day (no UTC shift). */
function parseReleaseCalendarDate(isoDate: string): Date | null {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

/**
 * Relative label for a release date (e.g. "today", "3 days ago").
 * Uses calendar-day difference so timezone does not flip the day.
 */
export function formatRelativeReleaseDate(
  isoDate: string,
  now: Date = new Date(),
): string {
  const releaseDay = parseReleaseCalendarDate(isoDate);

  if (!releaseDay) {
    return "";
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - releaseDay.getTime()) / (1000 * 60 * 60 * 24),
  );
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffDays) < 30) {
    return rtf.format(-diffDays, "day");
  }

  const diffMonths =
    (today.getFullYear() - releaseDay.getFullYear()) * 12 +
    (today.getMonth() - releaseDay.getMonth());

  if (Math.abs(diffMonths) < 12) {
    return rtf.format(-diffMonths, "month");
  }

  const diffYears = today.getFullYear() - releaseDay.getFullYear();
  return rtf.format(-diffYears, "year");
}

/**
 * Clock time for a release ship/push datetime (e.g. "4:15pm").
 * Accepts full ISO datetimes; returns null when missing or invalid.
 */
export function formatReleaseClockTime(
  isoDateTime: string | undefined | null,
): string | null {
  if (!isoDateTime) {
    return null;
  }

  const parsed = new Date(isoDateTime);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const hours = parsed.getHours();
  const minutes = parsed.getMinutes();
  const hour12 = hours % 12 || 12;
  const suffix = hours < 12 ? "am" : "pm";
  const minuteStr = minutes.toString().padStart(2, "0");

  return `${hour12}:${minuteStr}${suffix}`;
}

/**
 * What's New timestamp: `04.08.26 · 4:15pm` when `releasedAt` is set,
 * otherwise date-only (`04.08.26`) for older entries.
 */
export function formatReleaseTimestamp(
  date: string,
  releasedAt?: string | null,
): string {
  const absolute = formatReleaseDate(date);
  const clock = formatReleaseClockTime(releasedAt);

  if (clock) {
    return `${absolute} · ${clock}`;
  }

  return absolute;
}

export function getVersionWithDateLabel(): string {
  const release = getCurrentRelease();
  const versionLabel = formatVersionLabel();

  if (!release?.date) {
    return versionLabel;
  }

  return `${versionLabel} · ${formatReleaseDate(release.date)}`;
}

export function getReleaseForVersion(version: string): ReleaseNote | undefined {
  return RELEASES.find((release) => release.version === version);
}

export function getCurrentRelease(): ReleaseNote | undefined {
  return getReleaseForVersion(APP_VERSION) ?? RELEASES[0];
}

export function getAllReleases(): ReleaseNote[] {
  return RELEASES;
}

export function isReleaseManifestInSync(): boolean {
  return RELEASES.some((release) => release.version === APP_VERSION);
}
