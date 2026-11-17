import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  isReturnHistoryStatus,
  isScServiceOpenReturnStatus,
  RESERVE_ODRF_STATUS,
  returnRequestAppliesToLine,
  type ReturnHistoryAction,
} from "@/features/sales/constants/return-history-status";

export type SaleStatusCodeRef = {
  code: string;
  name: string;
  color: string | null;
};

const TO_FOLLOW_STATUS_FALLBACK: SaleStatusCodeRef = {
  code: "FW",
  name: "TO FOLLOW",
  color: "orange",
};

/** Open return-request steps. A finished return uses RETURNED / REPLACED instead. */
const OPEN_RETURN_REQUEST_CODES = new Set([
  "pending_cs",
  "pending_tl",
  "approved",
]);

/** Tiny fallbacks when sales_atr Settings codes are missing (unseeded tenant). */
const SALES_ATR_STATUS_FALLBACK: Record<string, SaleStatusCodeRef> = {
  pending_cs: { code: "pending_cs", name: "Pending CS", color: "amber" },
  pending_tl: { code: "pending_tl", name: "Pending TL", color: "amber" },
  approved: { code: "approved", name: "Approved", color: "emerald" },
  rejected: { code: "rejected", name: "Rejected", color: "rose" },
  completed: { code: "completed", name: "Completed", color: "emerald" },
  pending_sc: { code: "pending_sc", name: "Pending SC", color: "amber" },
  awaiting_stock: { code: "awaiting_stock", name: "Awaiting Stock", color: "sky" },
  open: { code: "open", name: "Open", color: "sky" },
  reserve: { code: "reserve", name: "Reserve", color: "amber" },
  closed: { code: "closed", name: "Closed", color: "slate" },
  RETURNED: { code: "RETURNED", name: "Returned", color: "violet" },
  REPLACED: { code: "REPLACED", name: "Replaced", color: "violet" },
};

export async function resolveToFollowStatusCode(
  tenantId: string,
): Promise<SaleStatusCodeRef> {
  const fw = await reasonStatusRepository.findCodeId(
    tenantId,
    "inventory_system",
    "FW",
  );
  if (!fw) return TO_FOLLOW_STATUS_FALLBACK;
  return { code: fw.code, name: fw.name, color: fw.color };
}

export async function loadSalesAtrCodesByCode(
  tenantId: string,
): Promise<Map<string, SaleStatusCodeRef>> {
  const codes = await reasonStatusRepository.listActiveCodesByCategory(
    tenantId,
    "sales_atr",
  );
  return new Map(
    codes.map((row) => [
      row.code,
      { code: row.code, name: row.name, color: row.color },
    ]),
  );
}

function findSalesAtrCode(
  code: string,
  codesByCode: Map<string, SaleStatusCodeRef>,
): SaleStatusCodeRef | undefined {
  const exact = codesByCode.get(code);
  if (exact) return exact;
  const folded = code.toLowerCase();
  for (const [key, value] of codesByCode) {
    if (key.toLowerCase() === folded) return value;
  }
  return undefined;
}

export function resolveSalesAtrStatusCode(
  code: string,
  codesByCode: Map<string, SaleStatusCodeRef>,
): SaleStatusCodeRef {
  return (
    findSalesAtrCode(code, codesByCode) ??
    SALES_ATR_STATUS_FALLBACK[code] ??
    SALES_ATR_STATUS_FALLBACK[code.toUpperCase()] ??
    SALES_ATR_STATUS_FALLBACK[code.toLowerCase()] ?? {
      code,
      name: code.replaceAll("_", " "),
      color: "amber",
    }
  );
}

function finishedReturnSettingsCode(
  actionType: ReturnHistoryAction | null | undefined,
): "RETURNED" | "REPLACED" {
  return actionType === "replacement" ? "REPLACED" : "RETURNED";
}

export interface ListedLineStatusDetail {
  id: string;
  serialNumberId: string | null;
  statusCode?: { code: string; name: string; color: string | null } | null;
}

export interface ListedLineStatusSale {
  atrStatus: string;
  returnRequest?: {
    status: string;
    saleDetailId: string | null;
    actionType?: ReturnHistoryAction | null;
    documentType?: { name: string } | null;
  } | null;
}

/**
 * List/details STATUS preference (never live inventory):
 * 1) Open return on this line: Pending CS, Pending TL, or Approved from Sales & ATR;
 *    Reserve ODRF while a service center has the unit (Pending SC, Awaiting Stock)
 * 2) Finished return on this line: Returned or Replaced (settings codes RETURNED, REPLACED)
 * 3) No return and a closed sale: Closed
 * 4) No return, no serial, and a reserve sale: Reserve
 * 5) Otherwise the frozen inventory status (Sold, Official Sold, TO FOLLOW)
 *
 * A rejected request is not a lasting status. The line goes back to that sale status.
 * Another line's return does not retitle this line; `keepFrozenStatus` also stops a
 * closed header from covering a sibling that is still Sold or TO FOLLOW.
 */
export function resolveLineStatusCode(
  detail: {
    serialNumberId: string | null;
    statusCode?: { code: string; name: string; color: string | null } | null;
  },
  atrStatus: string,
  toFollowStatus: SaleStatusCodeRef,
  salesAtrCodes: Map<string, SaleStatusCodeRef>,
  returnStatus?: string | null,
  _documentTypeName?: string | null,
  /**
   * Another line on this sale has the open or finished return. Keep this line's
   * own Sold / TO FOLLOW status instead of flipping it to Closed.
   */
  keepFrozenStatus?: boolean,
  actionType?: ReturnHistoryAction | null,
): SaleStatusCodeRef | null {
  const requestStep = returnStatus?.trim().toLowerCase() ?? "";
  if (isScServiceOpenReturnStatus(requestStep)) {
    return RESERVE_ODRF_STATUS;
  }
  if (OPEN_RETURN_REQUEST_CODES.has(requestStep)) {
    return resolveSalesAtrStatusCode(requestStep, salesAtrCodes);
  }
  if (requestStep === "completed") {
    return resolveSalesAtrStatusCode(
      finishedReturnSettingsCode(actionType),
      salesAtrCodes,
    );
  }

  if (atrStatus === "closed" && !keepFrozenStatus) {
    return resolveSalesAtrStatusCode("closed", salesAtrCodes);
  }

  if (!detail.serialNumberId && atrStatus === "reserve") {
    return resolveSalesAtrStatusCode("reserve", salesAtrCodes);
  }

  if (detail.statusCode) {
    return {
      code: detail.statusCode.code,
      name: detail.statusCode.name,
      color: detail.statusCode.color,
    };
  }

  if (!detail.serialNumberId) return toFollowStatus;
  return resolveSalesAtrStatusCode(atrStatus, salesAtrCodes);
}

/** Same STATUS the sales table shows for one listed line. */
export function resolveListedLineStatus(
  detail: ListedLineStatusDetail,
  sale: ListedLineStatusSale,
  toFollowStatus: SaleStatusCodeRef,
  salesAtrCodes: Map<string, SaleStatusCodeRef>,
): SaleStatusCodeRef | null {
  const request = sale.returnRequest ?? null;
  const applies = request
    ? returnRequestAppliesToLine(request.saleDetailId, detail.id)
    : false;

  return resolveLineStatusCode(
    detail,
    sale.atrStatus,
    toFollowStatus,
    salesAtrCodes,
    applies ? request?.status : null,
    request?.documentType?.name,
    Boolean(request && isReturnHistoryStatus(request.status) && !applies),
    applies ? request?.actionType : null,
  );
}
