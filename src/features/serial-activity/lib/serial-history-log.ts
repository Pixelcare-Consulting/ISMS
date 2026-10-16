import type { SerialHistoryTxnType } from "@prisma/client";

import type { SerialActivityType } from "@/features/serial-activity/constants/serial-activity-display";

interface HistoryActivity {
  type: SerialActivityType;
  /** Finer event name when the ledger type is narrower than the feed type. */
  typeLabel?: string;
}

/**
 * Ledger types the live feed already lists (transfer, sale, pull-out, count).
 * Those stay null so the log does not show the same movement twice.
 * Every other history type is a movement the live tables do not describe.
 */
const HISTORY_ACTIVITY: Record<SerialHistoryTxnType, HistoryActivity | null> = {
  grpo: { type: "registered", typeLabel: "Goods receipt" },
  delivery: { type: "transferred", typeLabel: "Delivery" },
  backload: { type: "transferred", typeLabel: "Backload" },
  inv_acknowledgement: { type: "status", typeLabel: "Acknowledged" },
  inv_status_update: { type: "status" },
  transfer: null,
  pullout: null,
  sales: null,
  reserved_sold: null,
  return: { type: "sold", typeLabel: "Return" },
  replacement: { type: "sold", typeLabel: "Replacement" },
  pcount: null,
  defect: { type: "status", typeLabel: "Defect" },
};

export function historyActivityForTxn(
  txnType: SerialHistoryTxnType,
): HistoryActivity | null {
  return HISTORY_ACTIVITY[txnType];
}

/** Ledger types that belong on the feed for this event filter (or all of them). */
export function historyTxnTypesForActivity(
  activityType?: SerialActivityType,
): SerialHistoryTxnType[] {
  const types: SerialHistoryTxnType[] = [];
  for (const [txnType, activity] of Object.entries(HISTORY_ACTIVITY) as Array<
    [SerialHistoryTxnType, HistoryActivity | null]
  >) {
    if (!activity) continue;
    if (activityType && activity.type !== activityType) continue;
    types.push(txnType);
  }
  return types;
}

const DETAIL_PHRASES: ReadonlyArray<{
  phrase: string;
  take: "token" | "rest";
}> = [
  { phrase: "sold on same invoice ", take: "rest" },
  { phrase: "sold on new invoice ", take: "rest" },
  { phrase: "p-count session ", take: "token" },
  { phrase: "returned to warehouse from ", take: "token" },
  { phrase: "hold released on ", take: "token" },
  { phrase: "in transit on ", take: "token" },
  { phrase: "dispatched on ", take: "token" },
  { phrase: "accepted on ", take: "token" },
  { phrase: "reserved on ", take: "token" },
  { phrase: "released on ", take: "token" },
  { phrase: "received on ", take: "token" },
  { phrase: "approved on ", take: "token" },
  { phrase: "added to ", take: "token" },
];

/** Document prefixes written by logistics, counts, replacements, and SAP refs. */
const DOCUMENT_PREFIX =
  /\b((?:DLV|XFR|PLT|CNT|REPL|SCS|SCO|SAP|SP)-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/iu;

const UNTIL_ARROW = /^(?:return|replacement)\s+(.+?)\s+→/iu;

function cleanReference(value: string): string | null {
  const cleaned = value.trim().replace(/[.,;:]+$/u, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function firstToken(value: string): string | null {
  const token = value.trim().split(/\s+/u)[0];
  if (!token) return null;
  return cleanReference(token);
}

function textAfterPhrase(details: string, phrase: string): string | null {
  const index = details.toLowerCase().indexOf(phrase);
  if (index < 0) return null;
  return details.slice(index + phrase.length);
}

function loneDocumentToken(details: string): string | null {
  if (/\s/u.test(details)) return null;
  if (!/\d/u.test(details) && !details.includes("-")) return null;
  return cleanReference(details);
}

/**
 * Document number stored inside `SerialNumberHistory.details`.
 * The log still shows the full details text beside this number.
 */
export function documentReferenceFromHistoryDetails(
  details: string | null | undefined,
): string | null {
  const text = details?.trim() ?? "";
  if (!text) return null;

  const arrow = UNTIL_ARROW.exec(text);
  if (arrow?.[1]) {
    const fromArrow = cleanReference(arrow[1]);
    if (fromArrow) return fromArrow;
  }

  for (const cue of DETAIL_PHRASES) {
    const rest = textAfterPhrase(text, cue.phrase);
    if (rest == null) continue;
    const reference = cue.take === "rest" ? cleanReference(rest) : firstToken(rest);
    if (reference) return reference;
  }

  const prefixed = DOCUMENT_PREFIX.exec(text);
  if (prefixed?.[1]) return prefixed[1];

  return loneDocumentToken(text);
}
