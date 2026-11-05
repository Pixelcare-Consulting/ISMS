/**
 * Decides what a Sales Order made directly in SAP becomes in ISMS (see
 * docs/client-weekly-2026-10-30-plan.md, item 7). Pure: the service reads SAP and ISMS,
 * this turns one SO into an order to create or a reason it is left out.
 */

export interface SapSalesOrderLine {
  lineNum: number;
  itemCode: string;
  quantity: number;
  warehouseCode: string;
  /** Branch dimension: the ISMS branch's SAP code. */
  branchCode: string;
}

export interface SapSalesOrder {
  docEntry: number;
  docNum: number;
  /** YYYY-MM-DD. */
  docDate: string | null;
  /** YYYY-MM-DD. */
  dueDate: string | null;
  cardCode: string;
  comments: string | null;
  open: boolean;
  lines: SapSalesOrderLine[];
}

/** ISMS records the plan resolves SAP codes against. */
export interface SapSalesOrderLookups {
  branchIdBySapCode: ReadonlyMap<string, string>;
  /** Central warehouses only: a branch selling from its own SAP warehouse is not an order. */
  warehouseIdByCode: ReadonlyMap<string, string>;
  modelBySku: ReadonlyMap<string, { id: string; brandId: string | null }>;
}

export interface SapSalesOrderImportPlan {
  orderNumber: string;
  branchId: string;
  sourceWarehouseId: string;
  brandId: string | null;
  lines: { modelId: string; quantity: number; sapLineNum: number }[];
}

export type SapSalesOrderDecision =
  | { import: true; plan: SapSalesOrderImportPlan }
  | { import: false; reason: string };

/** The ISMS order number of an imported SO; unique per tenant, so a re-run cannot import twice. */
export function sapSalesOrderNumber(docNum: number): string {
  return `SAP-SO-${docNum}`;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function int(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function isoDate(value: unknown): string | null {
  const date = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** A Service Layer `Orders` row (header and DocumentLines) as the import reads it. */
export function parseSapSalesOrder(raw: Record<string, unknown>): SapSalesOrder | null {
  const docEntry = int(raw.DocEntry);
  const docNum = int(raw.DocNum);
  if (docEntry == null || docNum == null) return null;
  const lines = ((raw.DocumentLines as Record<string, unknown>[] | undefined) ?? []).map((line) => ({
    lineNum: int(line.LineNum) ?? 0,
    itemCode: text(line.ItemCode),
    quantity: Number(line.Quantity ?? 0),
    warehouseCode: text(line.WarehouseCode),
    branchCode: text(line.CostingCode2),
  }));
  return {
    docEntry,
    docNum,
    docDate: isoDate(raw.DocDate),
    dueDate: isoDate(raw.DocDueDate),
    cardCode: text(raw.CardCode),
    comments: text(raw.Comments) || null,
    open: raw.DocumentStatus !== "bost_Close",
    lines,
  };
}

/**
 * Whether an SAP SO becomes an ISMS order. Every line must name the same ISMS branch on
 * the Branch dimension, ship from one ISMS central warehouse, and be a whole quantity of
 * a model ISMS knows. Open or closed is decided by the caller (a closed SO needs a DR).
 */
export function planSapSalesOrderImport(
  so: SapSalesOrder,
  lookups: SapSalesOrderLookups,
): SapSalesOrderDecision {
  const skip = (reason: string): SapSalesOrderDecision => ({ import: false, reason });
  const label = `SO ${so.docNum}`;
  if (so.lines.length === 0) return skip(`${label} has no lines`);

  const branchCodes = new Set(so.lines.map((line) => line.branchCode));
  if (branchCodes.size !== 1) return skip(`${label} names more than one Branch`);
  const [branchCode] = [...branchCodes];
  const branchId = branchCode ? lookups.branchIdBySapCode.get(branchCode) : undefined;
  if (!branchId) return skip(`${label}: Branch "${branchCode || "(none)"}" is not an ISMS branch`);

  const warehouseCodes = new Set(so.lines.map((line) => line.warehouseCode));
  if (warehouseCodes.size !== 1) return skip(`${label} ships from more than one warehouse`);
  const [warehouseCode] = [...warehouseCodes];
  const sourceWarehouseId = lookups.warehouseIdByCode.get(warehouseCode);
  if (!sourceWarehouseId) {
    return skip(`${label} ships from ${warehouseCode || "(none)"}, not an ISMS warehouse`);
  }

  const lines: SapSalesOrderImportPlan["lines"] = [];
  const brandIds = new Set<string | null>();
  for (const line of so.lines) {
    const model = lookups.modelBySku.get(line.itemCode);
    if (!model) return skip(`${label}: item ${line.itemCode || "(none)"} is not an ISMS model`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return skip(`${label}: item ${line.itemCode} has quantity ${line.quantity}`);
    }
    brandIds.add(model.brandId);
    lines.push({ modelId: model.id, quantity: line.quantity, sapLineNum: line.lineNum });
  }

  return {
    import: true,
    plan: {
      orderNumber: sapSalesOrderNumber(so.docNum),
      branchId,
      sourceWarehouseId,
      // An ISMS order is one brand; a mixed SO keeps no brand rather than guessing.
      brandId: brandIds.size === 1 ? ([...brandIds][0] ?? null) : null,
      lines,
    },
  };
}
