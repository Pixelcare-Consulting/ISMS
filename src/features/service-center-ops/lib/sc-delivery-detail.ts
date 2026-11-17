import type { DeliveryReceiptLine } from "@/features/logistics/services/delivery-posting.service";

/** One progress event, in the action names the branch delivery tracker reads. */
export interface ScDeliveryHistoryRow {
  id: string;
  action: string;
  at: string;
  userName: string | null;
}

export interface ScDeliveryAuditRow {
  id: string;
  action: string;
  createdAt: Date;
  userName: string | null;
}

/** SC delivery audit actions, as the branch delivery tracker names the same step. */
const AUDIT_TO_TRACKER_ACTION: Readonly<Record<string, string>> = {
  "sc_delivery.created_from_sap": "delivery.dispatched_in_sap",
  "sc_delivery.accepted": "delivery.accepted",
};

/**
 * SC deliveries keep no history of their own, so progress comes from what exists: the order's
 * approval, the delivery's creation (Check SAP found the DR), and each accept in the audit log.
 * Rows use the branch delivery action names so the branch tracker and labels apply unchanged.
 */
export function scDeliveryHistory(input: {
  deliveryId: string;
  createdAt: Date;
  orderApprovedAt: Date | null;
  audits: readonly ScDeliveryAuditRow[];
}): ScDeliveryHistoryRow[] {
  const rows: ScDeliveryHistoryRow[] = [];
  if (input.orderApprovedAt) {
    rows.push({
      id: `${input.deliveryId}:order-approved`,
      action: "delivery.created_from_order",
      at: input.orderApprovedAt.toISOString(),
      userName: null,
    });
  }
  const mapped = input.audits.flatMap((audit) => {
    const action = AUDIT_TO_TRACKER_ACTION[audit.action];
    return action
      ? [{ id: audit.id, action, at: audit.createdAt.toISOString(), userName: audit.userName }]
      : [];
  });
  // Pull-out redeliveries log no creation entry; the delivery's own creation stands in.
  if (!mapped.some((row) => row.action === "delivery.dispatched_in_sap")) {
    rows.push({
      id: `${input.deliveryId}:created`,
      action: "delivery.dispatched_in_sap",
      at: input.createdAt.toISOString(),
      userName: null,
    });
  }
  return [...rows, ...mapped].sort((a, b) => a.at.localeCompare(b.at));
}

export interface ScDeliveryUnit {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  acceptedAt: Date | null;
}

/** The DR's units as the branch receive dialog lists them: still DIT, or received. */
export function scDeliveryReceiptLines(units: readonly ScDeliveryUnit[]): DeliveryReceiptLine[] {
  return units.map((unit) => ({
    serialNumberId: unit.serialNumberId,
    serialNo: unit.serialNo,
    skuCode: unit.skuCode,
    modelName: unit.modelName,
    inTransit: unit.acceptedAt === null,
    openTransfer: null,
    openReturn: null,
    state: unit.acceptedAt === null ? "IN_TRANSIT" : "RECEIVED",
  }));
}
