import { createHash } from "node:crypto";

import {
  SAP_CHANGE_NOTIFICATION_PREFIX,
  sapChangeWatchRepository,
} from "@/features/sap/repositories/sap-change-watch.repository";

/** What one check found SAP has that ISMS doesn't, as the keys the sync matches on. */
export type SapChangeSet = {
  created: string[];
  updated: string[];
  removed: string[];
  /** Serial numbers only: `created` hit its cap, so the real count is higher. */
  createdCapped?: boolean;
};

/** Who hears about one sync's changes, and where they go to press Sync. */
export type SapChangeTarget = {
  syncKey: string;
  /** The page's own title, e.g. "Warehouses" — the notification names it. */
  label: string;
  permission: string;
  href: string;
};

export type SapChangeOutcome = "none" | "unchanged" | "published" | "cleared";

/** Closed auto-check notifications are kept this long, then hard-deleted. */
export const SAP_CHANGE_RETENTION_DAYS = 30;

/** Keys kept per bucket in the notification's metadata — enough to eyeball, never a dump. */
const METADATA_SAMPLE_SIZE = 20;

const countFormat = new Intl.NumberFormat("en-US");

/**
 * SHA-256 of the sorted affected keys, or null when nothing changed. Equal fingerprints
 * mean "same news": the open notification already says this, so nobody is pinged again.
 */
export function sapChangeFingerprint(changes: SapChangeSet): string | null {
  const lines = [
    ...changes.created.map((key) => `c:${key}`),
    ...changes.updated.map((key) => `u:${key}`),
    ...changes.removed.map((key) => `r:${key}`),
  ];
  if (lines.length === 0) return null;
  lines.sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function describeSapChanges(
  target: SapChangeTarget,
  changes: SapChangeSet,
): { title: string; body: string } {
  const created = countFormat.format(changes.created.length);
  const parts = [
    changes.created.length > 0
      ? `${created}${changes.createdCapped ? "+" : ""} new`
      : null,
    changes.updated.length > 0
      ? `${countFormat.format(changes.updated.length)} updated`
      : null,
    changes.removed.length > 0
      ? `${countFormat.format(changes.removed.length)} removed`
      : null,
  ].filter(Boolean);

  return {
    title: `SAP has new data for ${target.label}`,
    body: `${parts.join(" · ")} in SAP. Open ${target.label} and press Sync to bring them into ISMS.`,
  };
}

/**
 * Bring one sync's notification in line with what the check just found:
 *
 * - nothing changed → close the open notification. This is how a manual Sync clears it:
 *   the next check finds ISMS matching SAP.
 * - same changes as last time → leave it (read stays read).
 * - different changes → replace it, so it shows unread again for everyone.
 */
export async function notifySapChanges(input: {
  tenantId: string;
  target: SapChangeTarget;
  watch: { fingerprint: string | null; notificationId: string | null };
  changes: SapChangeSet;
}): Promise<SapChangeOutcome> {
  const { tenantId, target, watch, changes } = input;
  const fingerprint = sapChangeFingerprint(changes);

  if (fingerprint === null) {
    if (watch.notificationId === null && watch.fingerprint === null) return "none";
    const cleared = await sapChangeWatchRepository.clear({
      tenantId,
      syncKey: target.syncKey,
      previousNotificationId: watch.notificationId,
    });
    // False: an overlapping check already handled it.
    return cleared ? "cleared" : "unchanged";
  }

  if (
    fingerprint === watch.fingerprint &&
    watch.notificationId !== null &&
    (await sapChangeWatchRepository.isNotificationLive(watch.notificationId))
  ) {
    return "unchanged";
  }

  const { title, body } = describeSapChanges(target, changes);
  const published = await sapChangeWatchRepository.publish({
    tenantId,
    syncKey: target.syncKey,
    fingerprint,
    previousNotificationId: watch.notificationId,
    notification: {
      permissionKey: target.permission,
      type: `${SAP_CHANGE_NOTIFICATION_PREFIX}${target.syncKey}`,
      title,
      body,
      href: target.href,
      metadata: {
        syncKey: target.syncKey,
        counts: {
          created: changes.created.length,
          updated: changes.updated.length,
          removed: changes.removed.length,
        },
        createdCapped: changes.createdCapped ?? false,
        sample: {
          created: changes.created.slice(0, METADATA_SAMPLE_SIZE),
          updated: changes.updated.slice(0, METADATA_SAMPLE_SIZE),
          removed: changes.removed.slice(0, METADATA_SAMPLE_SIZE),
        },
      },
    },
  });
  // Null: an overlapping check already posted; its notification stands.
  return published === null ? "unchanged" : "published";
}

/** Hard-delete auto-check notifications closed more than the retention period ago. */
export function purgeClosedSapChangeNotifications(now = new Date()) {
  const before = new Date(now.getTime() - SAP_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return sapChangeWatchRepository.purgeClosedNotifications(before);
}
