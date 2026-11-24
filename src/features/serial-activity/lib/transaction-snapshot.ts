import type {
  SerialActivitySerialPair,
  SerialActivityTransaction,
} from "@/features/serial-activity/constants/serial-activity-display";
import { formatPeso } from "@/utils/format-currency";

/**
 * Transaction facts copied onto a log row so they survive after the sale is deleted.
 * Customer number is the sale contact number. Official Sales imports often have none.
 */
export interface TransactionSnapshot {
  transactionNo: string | null;
  /** Calendar day, `YYYY-MM-DD`. */
  transactionDate: string | null;
  /** Sale line amount, as a plain number string. */
  transactionAmount: string | null;
  customerName: string | null;
  customerNumber: string | null;
}

export interface ReplacementContext extends TransactionSnapshot {
  returnedSerialNo: string | null;
  replacedSerialNo: string | null;
}

export interface TransactionSnapshotInput {
  transactionNo?: string | null;
  transactionDate?: Date | string | null;
  transactionAmount?: unknown;
  customerName?: string | null;
  customerNumber?: string | null;
}

const EMPTY_SNAPSHOT: TransactionSnapshot = {
  transactionNo: null,
  transactionDate: null,
  transactionAmount: null,
  customerName: null,
  customerNumber: null,
};

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text || null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  if (typeof value !== "string") return null;
  return trimmed(value);
}

/** Finite sale-line amount, kept as a number string so metadata round-trips. */
export function amountToString(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw =
    typeof value === "number" || typeof value === "string"
      ? value
      : typeof value === "object" && value !== null && "toString" in value
        ? String(value)
        : null;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return String(n);
}

/** SI date or sale `transactionDate`, stored as the calendar day. */
export function dateToIsoDay(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/u.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Date label that does not shift the stored calendar day across time zones. */
export function formatTransactionDate(isoDay: string): string {
  const [year, month, day] = isoDay.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return isoDay;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function transactionSnapshotFromSale(input: TransactionSnapshotInput): TransactionSnapshot {
  return {
    transactionNo: trimmed(input.transactionNo),
    transactionDate: dateToIsoDay(input.transactionDate),
    transactionAmount: amountToString(input.transactionAmount),
    customerName: trimmed(input.customerName),
    customerNumber: trimmed(input.customerNumber),
  };
}

/** Metadata keys written on Official Sales audits and replacement history context. */
export function snapshotToMetadata(snapshot: TransactionSnapshot): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (snapshot.transactionNo) metadata.transactionNo = snapshot.transactionNo;
  if (snapshot.transactionDate) metadata.transactionDate = snapshot.transactionDate;
  if (snapshot.transactionAmount != null) metadata.transactionAmount = snapshot.transactionAmount;
  if (snapshot.customerName) metadata.customerName = snapshot.customerName;
  if (snapshot.customerNumber) metadata.customerNumber = snapshot.customerNumber;
  return metadata;
}

export function transactionSnapshotFromMetadata(
  metadata: Record<string, unknown> | null,
): TransactionSnapshot {
  if (!metadata) return { ...EMPTY_SNAPSHOT };
  return {
    transactionNo: readString(metadata, "transactionNo"),
    transactionDate: dateToIsoDay(readString(metadata, "transactionDate")),
    transactionAmount: amountToString(metadata.transactionAmount),
    customerName: readString(metadata, "customerName"),
    customerNumber: readString(metadata, "customerNumber"),
  };
}

/**
 * Official Sales rows use metadata. When that row never stored a date and the sale
 * still exists, fill the missing facts from the sale. A missing sale stays blank.
 */
export function resolveOfficialSalesSnapshot(
  metadata: Record<string, unknown> | null,
  liveSale: TransactionSnapshot | null,
): TransactionSnapshot {
  const stored = transactionSnapshotFromMetadata(metadata);
  if (stored.transactionDate || !liveSale) return stored;
  return {
    transactionNo: stored.transactionNo ?? liveSale.transactionNo,
    transactionDate: liveSale.transactionDate,
    transactionAmount: stored.transactionAmount ?? liveSale.transactionAmount,
    customerName: stored.customerName ?? liveSale.customerName,
    customerNumber: stored.customerNumber ?? liveSale.customerNumber,
  };
}

export function presentTransaction(
  snapshot: TransactionSnapshot,
): SerialActivityTransaction | null {
  const transactionNo = snapshot.transactionNo;
  const transactionDate = snapshot.transactionDate
    ? formatTransactionDate(snapshot.transactionDate)
    : null;
  const amount =
    snapshot.transactionAmount != null ? formatPeso(Number(snapshot.transactionAmount)) : null;
  const customerName = snapshot.customerName;
  const customerNumber = snapshot.customerNumber;
  if (!transactionNo && !transactionDate && !amount && !customerName && !customerNumber) {
    return null;
  }
  return { transactionNo, transactionDate, amount, customerName, customerNumber };
}

export function transactionReferenceLines(
  transaction: SerialActivityTransaction | null | undefined,
): string[] {
  if (!transaction) return [];
  return [
    transaction.transactionNo ? `Transaction ${transaction.transactionNo}` : null,
    transaction.transactionDate ? `Transaction date: ${transaction.transactionDate}` : null,
    transaction.amount,
    transaction.customerName ? `Customer: ${transaction.customerName}` : null,
    transaction.customerNumber ? `Customer number: ${transaction.customerNumber}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function officialSalesTransactionView(
  metadata: Record<string, unknown> | null,
  liveSale: TransactionSnapshot | null,
): { snapshot: TransactionSnapshot; transaction: SerialActivityTransaction | null; lines: string[] } {
  const snapshot = resolveOfficialSalesSnapshot(metadata, liveSale);
  const transaction = presentTransaction(snapshot);
  return { snapshot, transaction, lines: transactionReferenceLines(transaction) };
}

function readContextRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function replacementContextFromJson(value: unknown): ReplacementContext | null {
  const record = readContextRecord(value);
  if (!record) return null;
  const snapshot = transactionSnapshotFromMetadata(record);
  const returnedSerialNo = readString(record, "returnedSerialNo");
  const replacedSerialNo = readString(record, "replacedSerialNo");
  if (
    !snapshot.transactionNo &&
    !snapshot.transactionDate &&
    snapshot.transactionAmount == null &&
    !snapshot.customerName &&
    !snapshot.customerNumber &&
    !returnedSerialNo &&
    !replacedSerialNo
  ) {
    return null;
  }
  return { ...snapshot, returnedSerialNo, replacedSerialNo };
}

export function replacementContextRecord(
  input: TransactionSnapshotInput & {
    returnedSerialNo?: string | null;
    replacedSerialNo?: string | null;
  },
): Record<string, string> {
  const record = snapshotToMetadata(transactionSnapshotFromSale(input));
  const returnedSerialNo = trimmed(input.returnedSerialNo);
  const replacedSerialNo = trimmed(input.replacedSerialNo);
  if (returnedSerialNo) record.returnedSerialNo = returnedSerialNo;
  if (replacedSerialNo) record.replacedSerialNo = replacedSerialNo;
  return record;
}

function firstFilled(primary: string | null, fallback: string | null): string | null {
  return primary ?? fallback;
}

/**
 * Replacement rows prefer context. Fields context never stored still come from the
 * live sale and the replacement pair, while that sale still exists.
 */
export function resolveReplacementContext(
  stored: ReplacementContext | null,
  live: ReplacementContext | null,
): ReplacementContext {
  if (!stored) {
    return (
      live ?? {
        ...EMPTY_SNAPSHOT,
        returnedSerialNo: null,
        replacedSerialNo: null,
      }
    );
  }
  if (!live) return stored;
  return {
    transactionNo: firstFilled(stored.transactionNo, live.transactionNo),
    transactionDate: firstFilled(stored.transactionDate, live.transactionDate),
    transactionAmount: firstFilled(stored.transactionAmount, live.transactionAmount),
    customerName: firstFilled(stored.customerName, live.customerName),
    customerNumber: firstFilled(stored.customerNumber, live.customerNumber),
    returnedSerialNo: firstFilled(stored.returnedSerialNo, live.returnedSerialNo),
    replacedSerialNo: firstFilled(stored.replacedSerialNo, live.replacedSerialNo),
  };
}

/** Drop a pair that names one serial as both sides. */
export function distinctSerialPair(
  returnedSerialNo: string | null,
  replacedSerialNo: string | null,
): SerialActivitySerialPair | null {
  const returned = trimmed(returnedSerialNo);
  const replaced = trimmed(replacedSerialNo);
  if (returned && replaced && returned === replaced) return null;
  if (!returned && !replaced) return null;
  return { returnedSerialNo: returned, replacedSerialNo: replaced };
}
