import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import {
  isReturnHistoryStatus,
  returnHistoryStatusRef,
  returnRequestAppliesToLine,
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

/** Tiny fallbacks when sales_atr Settings codes are missing (unseeded tenant). */
const SALES_ATR_STATUS_FALLBACK: Record<string, SaleStatusCodeRef> = {
  pending_cs: { code: "pending_cs", name: "Pending CS", color: "amber" },
  pending_tl: { code: "pending_tl", name: "Pending TL", color: "amber" },
  approved: { code: "approved", name: "Approved", color: "emerald" },
  rejected: { code: "rejected", name: "Rejected", color: "rose" },
  completed: { code: "completed", name: "Completed", color: "emerald" },
  open: { code: "open", name: "Open", color: "sky" },
  reserve: { code: "reserve", name: "Reserve", color: "amber" },
  closed: { code: "closed", name: "Closed", color: "slate" },
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

export function resolveSalesAtrStatusCode(
  code: string,
  codesByCode: Map<string, SaleStatusCodeRef>,
): SaleStatusCodeRef {
  return (
    codesByCode.get(code) ??
    SALES_ATR_STATUS_FALLBACK[code] ?? {
      code,
      name: code.replaceAll("_", " "),
      color: "amber",
    }
  );
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
    documentType?: { name: string } | null;
  } | null;
}

/**
 * List/details STATUS preference (never live inventory):
 * 1) Returned/Replaced or Service Returned/Replaced while a return is open or finished
 * 2) Closed ATR header (no return history status)
 * 3) Frozen detail.statusCode (FW / SLD / RSV / OFS)
 * 4) Legacy derive from serial + atrStatus
 *
 * The product return status stays through request, approval, and completion.
 * Rejected requests fall through so the sale shows its inventory status again.
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
  documentTypeName?: string | null,
  /**
   * Another line on this sale is Returned/Replaced. Keep this line's own
   * Sold / TO FOLLOW status instead of flipping it to Closed.
   */
  keepFrozenStatus?: boolean,
): SaleStatusCodeRef | null {
  const historyStatus = returnHistoryStatusRef(returnStatus, documentTypeName);
  if (historyStatus) return historyStatus;

  if (atrStatus === "closed" && !keepFrozenStatus) {
    return resolveSalesAtrStatusCode("closed", salesAtrCodes);
  }

  if (detail.statusCode) {
    return {
      code: detail.statusCode.code,
      name: detail.statusCode.name,
      color: detail.statusCode.color,
    };
  }

  if (!detail.serialNumberId) {
    if (atrStatus === "reserve") {
      return resolveSalesAtrStatusCode("reserve", salesAtrCodes);
    }
    return toFollowStatus;
  }
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
  );
}
