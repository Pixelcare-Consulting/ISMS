// Client-safe shared types + labels for the serial-number activity feed.
// No server imports here — this file is imported by client components.

export type SerialActivityType =
  | "registered"
  | "status"
  | "transferred"
  | "sold"
  | "pulled_out"
  | "counted";

export const SERIAL_ACTIVITY_TYPES: SerialActivityType[] = [
  "registered",
  "status",
  "transferred",
  "sold",
  "pulled_out",
  "counted",
];

export const SERIAL_ACTIVITY_LABELS: Record<SerialActivityType, string> = {
  registered: "Registered",
  status: "Status update",
  transferred: "Transferred",
  sold: "Sales transaction",
  pulled_out: "Pulled out",
  counted: "Counted",
};

/** A single, flattened lifecycle event for one serialized unit. */
export interface SerialActivityEvent {
  /** Stable per-event id, e.g. `sold:<txnId>`. */
  id: string;
  type: SerialActivityType;
  timestamp: Date;
  serialNo: string;
  /** `${skuCode} — ${name}` of the unit's model. */
  modelLabel: string;
  /**
   * Where the unit ended up for this event — the destination for routed events
   * (transfers, pull-outs), the holding branch otherwise.
   */
  location: string | null;
  /** Reference document number (transfer no, transaction no, session no, …). */
  reference: string | null;
  /**
   * Full reference context, one entry per line — the movement route
   * (`Branch A → Branch B`), customer, amount, waybill, notes, and so on.
   */
  referenceDetails: string[];
  /** Status label where applicable (inventory status, count outcome, …). */
  status: string | null;
  /** User who performed the transaction, when captured. */
  performedBy: { name: string | null; email: string } | null;
}

export function formatSerialActivityPerformedBy(
  performedBy: SerialActivityEvent["performedBy"],
): string {
  if (!performedBy) return "—";
  return performedBy.name ?? performedBy.email;
}

export function formatSerialActivityType(type: SerialActivityType): string {
  return SERIAL_ACTIVITY_LABELS[type] ?? type;
}

export function formatSerialActivityTimestamp(value: Date): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
