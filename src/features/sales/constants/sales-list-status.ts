import type { Prisma } from "@prisma/client";

/**
 * Inventory statuses always shown on the Sales list / KPI cards.
 * Sales & ATR steps are added only when a row actually resolves to them.
 */
export const SALES_LIST_STATUS_CODES = ["SLD", "OFS", "FW"] as const;

/**
 * Older sales-list links. `returned` and `replaced` canonicalize to the
 * Sales & ATR codes RETURNED and REPLACED. Service labels stay so an old
 * link still filters. Combined `returned_replaced` links are not in this
 * list, so they open the sales list with no status filter.
 */
export const SALES_RETURN_HISTORY_LIST_CODES = [
  "returned",
  "replaced",
  "service_returned",
  "service_replaced",
] as const;

/**
 * Sales & ATR codes the sales cards can filter with `?status=`.
 * Returned and Replaced use the settings codes, not the older lowercase links.
 */
export const SALES_ATR_LIST_CODES = [
  "pending_cs",
  "pending_tl",
  "approved",
  "RETURNED",
  "REPLACED",
  "closed",
  "reserve",
  "open",
] as const;

export type SalesListStatusFilter =
  | (typeof SALES_LIST_STATUS_CODES)[number]
  | (typeof SALES_RETURN_HISTORY_LIST_CODES)[number]
  | (typeof SALES_ATR_LIST_CODES)[number];

/** Map a stored or query status onto the code the sales cards use. */
export function canonicalSalesListStatusCode(code: string): string {
  const trimmed = code.trim();
  const upper = trimmed.toUpperCase();
  if ((SALES_LIST_STATUS_CODES as readonly string[]).includes(upper)) {
    return upper;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "returned") return "RETURNED";
  if (lower === "replaced") return "REPLACED";
  const atrCode = SALES_ATR_LIST_CODES.find(
    (item) => item.toLowerCase() === lower,
  );
  if (atrCode) return atrCode;
  if ((SALES_RETURN_HISTORY_LIST_CODES as readonly string[]).includes(lower)) {
    return lower;
  }
  return trimmed;
}

function isSalesListStatusFilter(code: string): code is SalesListStatusFilter {
  return (
    (SALES_LIST_STATUS_CODES as readonly string[]).includes(code) ||
    (SALES_RETURN_HISTORY_LIST_CODES as readonly string[]).includes(code) ||
    (SALES_ATR_LIST_CODES as readonly string[]).includes(code)
  );
}

export function parseSalesListStatusFilter(
  value: string | undefined,
): SalesListStatusFilter | undefined {
  if (!value?.trim()) return undefined;
  const canonical = canonicalSalesListStatusCode(value);
  if (isSalesListStatusFilter(canonical)) return canonical;
  return undefined;
}

export function salesListStatusCodesMatch(
  resolvedCode: string,
  filter: SalesListStatusFilter,
): boolean {
  return canonicalSalesListStatusCode(resolvedCode) === filter;
}

/** Return steps that keep Returned or Replaced on the sales list. */
const RETURN_HISTORY_STATUSES = [
  "pending_cs",
  "pending_tl",
  "approved",
  "completed",
] as const;

/**
 * Sale-line filter shared by branch and service center sale lines (both tables have the
 * same columns). Typed per table by the wrappers below.
 *
 * Default (KPIs, order analytics): open sales only. Closed ATR headers and
 * in-progress returns stay off those counts.
 *
 * Sales list (`includeReturnHistory`): also keeps open and finished returns,
 * including a closed ATR, so the line can show its Sales & ATR step or
 * Returned / Replaced. A rejected return comes back as a normal open sale.
 */
function saleLineListFilter(
  saleScope: { tenantId: string; serviceCenterId?: { in: string[] } },
  options?: { includeReturnHistory?: boolean },
) {
  const openSale = {
    ...saleScope,
    atrStatus: { not: "closed" as const },
    OR: [
      { returnRequest: { is: null } },
      { returnRequest: { is: { status: "completed" as const } } },
    ],
  };

  const sale = options?.includeReturnHistory
    ? {
        ...saleScope,
        OR: [
          {
            atrStatus: { not: "closed" as const },
            OR: [
              { returnRequest: { is: null } },
              { returnRequest: { is: { status: "rejected" as const } } },
            ],
          },
          {
            returnRequest: {
              is: { status: { in: [...RETURN_HISTORY_STATUSES] } },
            },
          },
        ],
      }
    : openSale;

  return {
    AND: [
      { sale },
      {
        OR: [
          { statusCode: { code: { in: [...SALES_LIST_STATUS_CODES] } } },
          // Legacy TO FOLLOW rows before statusCode was frozen on details.
          {
            statusCodeId: null,
            serialNumberId: null,
            sale: { atrStatus: { not: "reserve" as const } },
          },
        ],
      },
    ],
  };
}

/**
 * Prisma filter: branch sale lines whose frozen inventory status is Sold / Official Sold /
 * TO FOLLOW. See `saleLineListFilter` for the two modes.
 */
export function salesListDetailWhere(
  tenantId: string,
  options?: { includeReturnHistory?: boolean },
): Prisma.BranchSalesTransactionDetailWhereInput {
  return saleLineListFilter({ tenantId }, options);
}

/** Service center sale lines, limited to the user's service centers when scoped. */
export function serviceCenterSalesListDetailWhere(
  tenantId: string,
  serviceCenterIds: string[] | null,
  options?: { includeReturnHistory?: boolean },
): Prisma.ServiceCenterSalesTransactionDetailWhereInput {
  return saleLineListFilter(
    serviceCenterIds
      ? { tenantId, serviceCenterId: { in: serviceCenterIds } }
      : { tenantId },
    options,
  );
}
