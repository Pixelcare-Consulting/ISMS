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
  sold: "Sold",
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
  /** Relevant branch/location for the event (may be a `from → to` route). */
  location: string | null;
  /** Reference document number (transfer no, transaction no, session no, …). */
  reference: string | null;
  /** Status label where applicable (inventory status, count outcome). */
  status: string | null;
  /** Sale amount as a raw string, when the event is a sale. */
  amount: string | null;
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

/**
 * Event label with its reference details appended, e.g. `Status update: Sold`
 * or `Transferred: TR-0001`. Falls back to the plain label when the event has
 * no reference, status or amount.
 */
export function formatSerialActivityEvent(event: SerialActivityEvent): string {
  const label = formatSerialActivityType(event.type);
  const details = [event.reference, event.status, event.amount].filter(
    (value): value is string => Boolean(value),
  );
  return details.length > 0 ? `${label}: ${details.join(" · ")}` : label;
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
