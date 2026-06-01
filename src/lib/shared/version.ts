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

export function getVersionWithDateLabel(): string {
  const release = getCurrentRelease();
  const versionLabel = formatVersionLabel();

  if (!release?.date) {
    return versionLabel;
  }

  return `${versionLabel} ${formatReleaseDate(release.date)}`;
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
