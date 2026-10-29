import { createHash } from "node:crypto";

import { LOGISTICS_DELIVERY_DISPATCH } from "@/features/logistics/constants/logistics-permissions";
import { SAP_FOLLOW_STATUS } from "@/features/logistics/services/sap-copy-to-follow.planner";
import {
  SAP_CHANGE_NOTIFICATION_PREFIX,
  sapChangeWatchRepository,
} from "@/features/sap/repositories/sap-change-watch.repository";
import { prisma } from "@/lib/database/client";

/**
 * Tells logistics when a SAP Copy To document (IT / DR) needs a person: FLAGGED (cancelled
 * in SAP, or not from this order's ITR / SO), or still FAILED after a few retries. Uses the
 * SAP auto-check's notification store, so there is one open notification per tenant and it
 * clears itself once every document is applied or resolved.
 */

/** Watch key in `SapChangeWatch`, also the notification type suffix. */
export const COPY_TO_ATTENTION_KEY = "copy-to-follow";

/** A FAILED document is only worth a notification once retrying has not fixed it. */
export const NOTIFY_AFTER_ATTEMPTS = 3;

/** Documents named in the notification body; the delivery page lists all of them. */
const BODY_SAMPLE = 3;

export interface AttentionDocument {
  docKind: string;
  docEntry: number;
  displayNo: string;
  status: string;
  error: string | null;
  deliveryId: string;
  deliveryNo: string;
}

/** Same documents in the same state → same fingerprint, so nobody is pinged twice. */
export function attentionFingerprint(docs: readonly AttentionDocument[]): string | null {
  if (docs.length === 0) return null;
  const lines = docs.map((doc) => `${doc.docKind}:${doc.docEntry}:${doc.status}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function describeAttention(docs: readonly AttentionDocument[]): {
  title: string;
  body: string;
  href: string;
} {
  const count = docs.length;
  const title =
    count === 1
      ? `SAP ${docs[0]!.docKind} ${docs[0]!.displayNo} could not be added to a delivery`
      : `${count} SAP documents could not be added to deliveries`;
  const lines = docs
    .slice(0, BODY_SAMPLE)
    .map((doc) => `${doc.docKind} ${doc.displayNo} (${doc.deliveryNo}): ${doc.error ?? "needs review"}`);
  if (count > BODY_SAMPLE) lines.push(`and ${count - BODY_SAMPLE} more.`);
  const deliveries = new Set(docs.map((doc) => doc.deliveryId));
  return {
    title,
    body: lines.join(" · "),
    href:
      deliveries.size === 1
        ? `/logistics/deliveries/${docs[0]!.deliveryId}`
        : "/logistics/deliveries",
  };
}

async function listAttention(tenantId: string): Promise<AttentionDocument[]> {
  const rows = await prisma.deliverySapDocument.findMany({
    where: {
      tenantId,
      OR: [
        { status: SAP_FOLLOW_STATUS.FLAGGED },
        { status: SAP_FOLLOW_STATUS.FAILED, attempts: { gte: NOTIFY_AFTER_ATTEMPTS } },
      ],
    },
    orderBy: { docEntry: "asc" },
    select: {
      docKind: true,
      docEntry: true,
      displayNo: true,
      status: true,
      error: true,
      delivery: { select: { id: true, deliveryNo: true } },
    },
  });
  return rows.map((row) => ({
    docKind: row.docKind,
    docEntry: row.docEntry,
    displayNo: row.displayNo,
    status: row.status,
    error: row.error,
    deliveryId: row.delivery.id,
    deliveryNo: row.delivery.deliveryNo,
  }));
}

/** Publish, refresh or clear the tenant's "documents need attention" notification. */
export async function notifyCopyToAttention(
  tenantId: string,
): Promise<"none" | "unchanged" | "published" | "cleared"> {
  const docs = await listAttention(tenantId);
  const fingerprint = attentionFingerprint(docs);
  const watch = await sapChangeWatchRepository.get(tenantId, COPY_TO_ATTENTION_KEY);

  if (fingerprint === null) {
    if (watch.notificationId === null && watch.fingerprint === null) return "none";
    const cleared = await sapChangeWatchRepository.clear({
      tenantId,
      syncKey: COPY_TO_ATTENTION_KEY,
      previousNotificationId: watch.notificationId,
    });
    return cleared ? "cleared" : "unchanged";
  }

  if (
    fingerprint === watch.fingerprint &&
    watch.notificationId !== null &&
    (await sapChangeWatchRepository.isNotificationLive(watch.notificationId))
  ) {
    return "unchanged";
  }

  const { title, body, href } = describeAttention(docs);
  const published = await sapChangeWatchRepository.publish({
    tenantId,
    syncKey: COPY_TO_ATTENTION_KEY,
    fingerprint,
    previousNotificationId: watch.notificationId,
    notification: {
      permissionKey: LOGISTICS_DELIVERY_DISPATCH,
      type: `${SAP_CHANGE_NOTIFICATION_PREFIX}${COPY_TO_ATTENTION_KEY}`,
      title,
      body,
      href,
      metadata: {
        documents: docs.slice(0, 20).map((doc) => ({
          docKind: doc.docKind,
          displayNo: doc.displayNo,
          deliveryNo: doc.deliveryNo,
          status: doc.status,
        })),
      },
    },
  });
  return published === null ? "unchanged" : "published";
}
