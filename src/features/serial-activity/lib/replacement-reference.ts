/** Serials and invoice numbers stored on a completed sales replacement. */
export interface ReplacementSerialPair {
  originalSerialNo: string | null;
  replacementSerialNo: string | null;
  originalInvoiceNo: string | null;
  replacementInvoiceNo: string | null;
}

/** A replacement pair plus the serial ids a ledger row is stored against. */
export interface HistoryReplacementPair extends ReplacementSerialPair {
  originalSerialNumberId: string | null;
  replacementSerialNumberId: string | null;
}

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Remark on the returned unit's log row: the unit that replaced it. */
export function replacementSnRemark(replacementSerialNo: string): string {
  return `Replacement SN: ${replacementSerialNo}`;
}

/** Remark on the replacement unit's log row: the unit it replaced. */
export function replacedSnRemark(originalSerialNo: string): string {
  return `Replaced SN: ${originalSerialNo}`;
}

/** Which side of the pair a log row is about. */
type ReplacementSide = "original" | "replacement";

/**
 * The other serial of the pair, labelled from this row's side: the returned (old) unit shows
 * its Replacement SN, the replacement (new) unit shows the Replaced SN.
 * Blank or identical serials return null so the log never names the unit itself.
 */
function pairRemark(pair: ReplacementSerialPair, side: ReplacementSide): string | null {
  const original = trimmed(pair.originalSerialNo);
  const replacement = trimmed(pair.replacementSerialNo);
  if (!original || !replacement || original === replacement) return null;
  return side === "original" ? replacementSnRemark(replacement) : replacedSnRemark(original);
}

/**
 * Same-invoice replacement stores this sale number on one or both invoice fields.
 * A new invoice stores a different replacement invoice, so this stays false.
 */
function invoicesAreSameSale(
  originalInvoice: string,
  replacementInvoice: string,
  transactionNo: string,
): boolean {
  const onThisSale =
    originalInvoice === transactionNo || replacementInvoice === transactionNo;
  if (!onThisSale) return false;
  if (!originalInvoice || !replacementInvoice) return true;
  return originalInvoice === replacementInvoice;
}

/**
 * Remark for a Replaced sale line.
 * - Same invoice, branch replacement: the line now holds the new serial (Replaced SN).
 * - Same invoice, service center replacement: the line keeps the returned serial (Replacement SN).
 * - New invoice: the original sale still carries the returned serial (Replacement SN).
 */
export function saleLineReplacementReference(
  replacements: readonly ReplacementSerialPair[],
  lineSerialNo: string,
  transactionNo: string,
): string | null {
  const serial = trimmed(lineSerialNo);
  const invoice = trimmed(transactionNo);
  if (!serial || !invoice) return null;

  for (const row of replacements) {
    const original = trimmed(row.originalSerialNo);
    const replacement = trimmed(row.replacementSerialNo);
    const originalInvoice = trimmed(row.originalInvoiceNo);
    const replacementInvoice = trimmed(row.replacementInvoiceNo);
    const sameSale = invoicesAreSameSale(originalInvoice, replacementInvoice, invoice);
    if (replacement === serial && sameSale) return pairRemark(row, "replacement");
    const keepsOriginal =
      original === serial &&
      originalInvoice === invoice &&
      (sameSale || (replacementInvoice !== "" && replacementInvoice !== invoice));
    if (keepsOriginal) return pairRemark(row, "original");
  }
  return null;
}

/**
 * Remark for a replacement ledger row. `invoice` is the document already parsed
 * from the history text. Pass pairs newest first when more than one could match.
 */
export function historyReplacementReference(
  pairs: readonly HistoryReplacementPair[],
  serialNumberId: string,
  invoice: string | null | undefined,
): string | null {
  const document = trimmed(invoice);
  if (!serialNumberId || !document) return null;

  for (const row of pairs) {
    const originalInvoice = trimmed(row.originalInvoiceNo);
    const replacementInvoice = trimmed(row.replacementInvoiceNo);
    const soldAsReplacement =
      row.replacementSerialNumberId === serialNumberId &&
      (replacementInvoice === document ||
        (replacementInvoice === "" && originalInvoice === document));
    if (soldAsReplacement) return pairRemark(row, "replacement");
    const restoredOriginal =
      row.originalSerialNumberId === serialNumberId && originalInvoice === document;
    if (restoredOriginal) return pairRemark(row, "original");
  }
  return null;
}
