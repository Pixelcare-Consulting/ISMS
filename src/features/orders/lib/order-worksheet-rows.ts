import type { BranchOrderType, SkuStatus } from "@prisma/client";

import type { OrderWorksheetLine } from "@/features/orders/types/order-analytics";

export interface WorksheetDraftInput {
  requestedQty: number;
  remarks: string;
  approvedQty: number | null;
  spRemarks: string;
  additionalItem: boolean;
}

export const EMPTY_WORKSHEET_DRAFT: WorksheetDraftInput = {
  requestedQty: 0,
  remarks: "",
  approvedQty: null,
  spRemarks: "",
  additionalItem: false,
};

export interface ProjectedWorksheetLine extends OrderWorksheetLine {
  requestedQty: number;
  remarks: string;
  approvedQty: number | null;
  spRemarks: string;
  additionalItem: boolean;
  /** Create mode may block a row. Review and view keep the saved quantity. */
  requestable: boolean;
  /**
   * 1-based position in the unfiltered sheet.
   * Models and planogram lines do not store their own index.
   */
  sheetIndex: number;
}

export interface OrderLineDraftSource {
  modelId: string;
  quantity: number;
  remarks?: string | null;
  spRemarks?: string | null;
  approvedQty?: number | null;
}

function wholeQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function blockedStatus(status: SkuStatus): boolean {
  return status === "hold" || status === "retired";
}

export function canRequestWorksheetLine(
  orderType: BranchOrderType,
  line: Pick<OrderWorksheetLine, "newlyOrderable" | "modelStatus" | "sugQty">,
  additionalItem: boolean,
): boolean {
  if (blockedStatus(line.modelStatus)) return false;
  switch (orderType) {
    case "special":
      return line.newlyOrderable || additionalItem;
    case "auto_replenish":
      return line.newlyOrderable;
    case "manual":
      return line.newlyOrderable && line.sugQty != null && line.sugQty > 0;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }
}

function capCreateQty(
  orderType: BranchOrderType,
  line: Pick<OrderWorksheetLine, "sugQty">,
  requestedQty: number,
): number {
  const qty = wholeQty(requestedQty);
  if (orderType === "manual" && line.sugQty != null) return Math.min(qty, line.sugQty);
  return qty;
}

/**
 * No. shown on the sheet.
 * A real index wins when the line carries one. Otherwise the number is the
 * 1-based position in the unfiltered sheet, so filtering does not renumber it.
 */
export function worksheetIndexNo(line: {
  indexNo?: number | null;
  sheetIndex: number;
}): number {
  const indexNo = line.indexNo;
  if (typeof indexNo === "number" && Number.isInteger(indexNo) && indexNo > 0) {
    return indexNo;
  }
  return line.sheetIndex;
}

export function projectWorksheetLines(
  lines: readonly OrderWorksheetLine[],
  drafts: Readonly<Record<string, WorksheetDraftInput | undefined>>,
  orderType: BranchOrderType,
  mode: "create" | "readonly",
): ProjectedWorksheetLine[] {
  return lines.map((line, index) => {
    const draft = drafts[line.modelId] ?? EMPTY_WORKSHEET_DRAFT;
    const requestable =
      mode === "create"
        ? canRequestWorksheetLine(orderType, line, draft.additionalItem)
        : true;
    const requestedQty =
      mode === "create"
        ? requestable
          ? capCreateQty(orderType, line, draft.requestedQty)
          : 0
        : wholeQty(draft.requestedQty);
    return {
      ...line,
      requestedQty,
      remarks: draft.remarks,
      approvedQty: approvedQtyForRow(requestedQty, draft.approvedQty),
      spRemarks: draft.spRemarks,
      additionalItem: draft.additionalItem,
      requestable,
      sheetIndex: index + 1,
    };
  });
}

export function approvedQtyForRow(
  requestedQty: number,
  approvedQty: number | null,
): number | null {
  if (requestedQty < 1) return null;
  const raw = approvedQty == null ? requestedQty : approvedQty;
  if (!Number.isInteger(raw) || raw < 1) return requestedQty;
  if (raw > requestedQty) return requestedQty;
  return raw;
}

export function draftsForOrderLines(
  worksheetLines: readonly OrderWorksheetLine[],
  orderLines: readonly OrderLineDraftSource[],
): Record<string, WorksheetDraftInput> {
  const byModel = new Map(orderLines.map((line) => [line.modelId, line]));
  const drafts: Record<string, WorksheetDraftInput> = {};
  for (const line of worksheetLines) {
    const orderLine = byModel.get(line.modelId);
    const requestedQty = wholeQty(orderLine?.quantity ?? 0);
    drafts[line.modelId] = {
      requestedQty,
      remarks: orderLine?.remarks ?? "",
      spRemarks: orderLine?.spRemarks ?? "",
      approvedQty: requestedQty >= 1 ? (orderLine?.approvedQty ?? requestedQty) : null,
      additionalItem: false,
    };
  }
  return drafts;
}
