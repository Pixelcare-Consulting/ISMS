/** Brand plus the model label when both exist. Either one alone is enough. */
export function replacementModelText(
  brandName: string | null | undefined,
  modelLabel: string | null | undefined,
): string | null {
  const brand = brandName?.trim() || null;
  const model = modelLabel?.trim() || null;
  if (brand && model) return `${brand} ${model}`;
  return model ?? brand;
}

export interface ReplacementSerialModel {
  skuCode?: string | null;
  name?: string | null;
  brand?: { name?: string | null } | null;
}

/** Model text from a serial's model: SKU when it has one, otherwise the model name. */
export function serialModelText(
  serial: { model?: ReplacementSerialModel | null } | null | undefined,
): string | null {
  const model = serial?.model;
  if (!model) return null;
  const label = model.skuCode?.trim() || model.name?.trim() || null;
  return replacementModelText(model.brand?.name, label);
}

export function saleLineModelText(input: {
  brandName?: string | null;
  model?: { skuCode?: string | null; name?: string | null } | null;
}): string | null {
  const label = input.model?.skuCode?.trim() || input.model?.name?.trim() || null;
  return replacementModelText(input.brandName, label);
}

/**
 * Muted line under the replacement model and serial pickers.
 * Omits a missing model or serial. Returns null when both are missing.
 */
export function formatSaleLineHint(input: {
  model?: string | null;
  serial?: string | null;
}): string | null {
  const model = input.model?.trim() || null;
  const serial = input.serial?.trim() || null;
  const parts = ["Sale line"];
  if (model) parts.push(model);
  if (serial) parts.push(`SN ${serial}`);
  if (parts.length === 1) return null;
  return parts.join(" · ");
}

/**
 * Muted second line on a sales row whose unit was replaced on the same invoice.
 * Omits a missing model or serial. Returns null when both are missing.
 */
export function formatWasReplacedLine(input: {
  model?: string | null;
  serial?: string | null;
}): string | null {
  const model = input.model?.trim() || null;
  const serial = input.serial?.trim() || null;
  if (model && serial) return `Was ${model} · SN ${serial}`;
  if (model) return `Was ${model}`;
  if (serial) return `Was SN ${serial}`;
  return null;
}

export interface SameInvoiceReplacementRef {
  replacementInvoiceNo: string | null;
  originalSerialNumber: {
    serialNo: string;
    model: ReplacementSerialModel | null;
  } | null;
  replacementSerialNumber: { id: string } | null;
}

/**
 * Was-line for the sale line that now holds the replacement serial.
 * Only a same-invoice replacement counts: its invoice number is the sale's.
 */
export function wasLineForSameInvoiceReplacement(input: {
  lineSerialNumberId: string | null;
  transactionNo: string;
  replacements?: SameInvoiceReplacementRef[] | null;
}): string | null {
  const lineSerialId = input.lineSerialNumberId;
  const transactionNo = input.transactionNo.trim();
  if (!lineSerialId || !transactionNo) return null;

  const match = (input.replacements ?? []).find((row) => {
    if (row.replacementSerialNumber?.id !== lineSerialId) return false;
    return (row.replacementInvoiceNo?.trim() || null) === transactionNo;
  });
  if (!match) return null;

  return formatWasReplacedLine({
    model: serialModelText(match.originalSerialNumber),
    serial: match.originalSerialNumber?.serialNo,
  });
}

export interface ReplacementPairLabels {
  originalModel: string | null;
  originalSerialNo: string | null;
  newModel: string | null;
  newSerialNo: string | null;
}

/** Original and new unit from the two serials stored on a replacement. */
export function replacementPairFromSerials(input: {
  originalSerialNumber: {
    serialNo: string;
    model: ReplacementSerialModel | null;
  } | null;
  replacementSerialNumber: {
    serialNo: string;
    model: ReplacementSerialModel | null;
  } | null;
}): ReplacementPairLabels | null {
  const originalModel = serialModelText(input.originalSerialNumber);
  const originalSerialNo = input.originalSerialNumber?.serialNo?.trim() || null;
  const newModel = serialModelText(input.replacementSerialNumber);
  const newSerialNo = input.replacementSerialNumber?.serialNo?.trim() || null;
  if (!originalModel && !originalSerialNo && !newModel && !newSerialNo) return null;
  return { originalModel, originalSerialNo, newModel, newSerialNo };
}
