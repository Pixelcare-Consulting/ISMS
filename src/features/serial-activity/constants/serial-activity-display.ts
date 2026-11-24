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

/** Sale facts shown in View details. Customer number is the sale contact number. */
export interface SerialActivityTransaction {
  transactionNo: string | null;
  transactionDate: string | null;
  amount: string | null;
  customerName: string | null;
  customerNumber: string | null;
}

/** Returned unit and the unit that replaced it. Either side may be unknown. */
export interface SerialActivitySerialPair {
  returnedSerialNo: string | null;
  replacedSerialNo: string | null;
}

/** One approval step: who did it, when (Manila), and the note they left. */
export interface SerialActivityApproval {
  action: string;
  person: string | null;
  when: string;
  note: string | null;
}

export function formatSerialActivityApproval(approval: SerialActivityApproval): string {
  const note = approval.note?.trim();
  return `${approval.action}${approval.person ? ` by ${approval.person}` : ""} · ${approval.when}${note ? ` · Note: ${note}` : ""}`;
}

/** A single, flattened lifecycle event for one serialized unit. */
export interface SerialActivityEvent {
  /** Stable per-event id, e.g. `sold:<txnId>`. */
  id: string;
  type: SerialActivityType;
  /**
   * Overrides the type label in the Event column when the source needs a finer
   * name than the type carries — e.g. an Official Sales import vs a branch sale,
   * both of which are `sold`.
   */
  typeLabel?: string;
  timestamp: Date;
  serialNo: string;
  /** `${skuCode} — ${name}` of the unit's model. */
  modelLabel: string;
  /**
   * Where the unit was for this event. For Registered, this is the first known
   * placement branch (historical) — not the live inventory branch after moves.
   * For routed events (transfers, pull-outs) it is the destination; otherwise
   * the holding branch at event time.
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
  /** Transaction number, date, amount, customer, and customer number, when known. */
  transaction?: SerialActivityTransaction | null;
  /** Returned and replaced serials on a replacement event. */
  serialPair?: SerialActivitySerialPair | null;
  /** Approval steps with the person and the Manila date and time. */
  approvals?: SerialActivityApproval[];
}

export function formatSerialActivityPerformedBy(
  performedBy: SerialActivityEvent["performedBy"],
): string {
  if (!performedBy) return "—";
  return performedBy.name ?? performedBy.email;
}

export function formatSerialActivityType(
  event: Pick<SerialActivityEvent, "type" | "typeLabel">,
): string {
  return event.typeLabel ?? SERIAL_ACTIVITY_LABELS[event.type] ?? event.type;
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
