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

/**
 * `original → replacement` on a serial-number log.
 * Blank or identical serials return null so the log never prints `same → same`.
 */
export function replacementSerialReferenceLine(
  originalSerialNo: string | null | undefined,
  replacementSerialNo: string | null | undefined,
): string | null {
  const original = trimmed(originalSerialNo);
  const replacement = trimmed(replacementSerialNo);
  if (!original || !replacement || original === replacement) return null;
  return `${original} → ${replacement}`;
}

function pairLine(pair: ReplacementSerialPair): string | null {
  return replacementSerialReferenceLine(pair.originalSerialNo, pair.replacementSerialNo);
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
 * Arrow for a Replaced sale line.
 * Same invoice: the line serial is already the replacement serial.
 * New invoice: the original sale still carries the original serial.
 */
export function saleLineReplacementReference(
  replacements: readonly ReplacementSerialPair[],
  lineSerialNo: string,
  transactionNo: string,
): string | null {
  const serial = trimmed(lineSerialNo);
  const invoice = trimmed(transactionNo);
  if (!serial || !invoice) return null;

  const pair = replacements.find((row) => {
    const original = trimmed(row.originalSerialNo);
    const replacement = trimmed(row.replacementSerialNo);
    const originalInvoice = trimmed(row.originalInvoiceNo);
    const replacementInvoice = trimmed(row.replacementInvoiceNo);
    const sameInvoice =
      replacement === serial &&
      invoicesAreSameSale(originalInvoice, replacementInvoice, invoice);
    const newInvoiceKeepsOriginal =
      original === serial &&
      originalInvoice === invoice &&
      replacementInvoice !== "" &&
      replacementInvoice !== invoice;
    return sameInvoice || newInvoiceKeepsOriginal;
  });

  return pair ? pairLine(pair) : null;
}

/**
 * Arrow for a replacement ledger row. `invoice` is the document already parsed
 * from the history text. Pass pairs newest first when more than one could match.
 */
export function historyReplacementReference(
  pairs: readonly HistoryReplacementPair[],
  serialNumberId: string,
  invoice: string | null | undefined,
): string | null {
  const document = trimmed(invoice);
  if (!serialNumberId || !document) return null;

  const pair = pairs.find((row) => {
    const originalInvoice = trimmed(row.originalInvoiceNo);
    const replacementInvoice = trimmed(row.replacementInvoiceNo);
    const soldAsReplacement =
      row.replacementSerialNumberId === serialNumberId &&
      (replacementInvoice === document ||
        (replacementInvoice === "" && originalInvoice === document));
    const restoredOriginal =
      row.originalSerialNumberId === serialNumberId && originalInvoice === document;
    return soldAsReplacement || restoredOriginal;
  });

  return pair ? pairLine(pair) : null;
}
