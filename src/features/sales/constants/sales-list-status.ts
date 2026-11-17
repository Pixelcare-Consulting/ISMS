import type { Prisma } from "@prisma/client";

/**
 * Sale line status codes that belong on the Sales list / KPIs.
 * Return workflow (Pending CS/TL, Approved, Rejected, Closed) and RSV live on Returns.
 */
export const SALES_LIST_STATUS_CODES = ["SLD", "OFS", "FW"] as const;

/**
 * STATUS values the sales table shows for a return that is requested,
 * approved, or finished. These are not inventory reason codes.
 */
export const SALES_RETURN_HISTORY_LIST_CODES = [
  "returned_replaced",
  "service_returned_replaced",
] as const;

export type SalesListStatusFilter =
  | (typeof SALES_LIST_STATUS_CODES)[number]
  | (typeof SALES_RETURN_HISTORY_LIST_CODES)[number];

/** Map a stored or query status onto the code the sales cards use. */
export function canonicalSalesListStatusCode(code: string): string {
  const trimmed = code.trim();
  const upper = trimmed.toUpperCase();
  if ((SALES_LIST_STATUS_CODES as readonly string[]).includes(upper)) {
    return upper;
  }
  const lower = trimmed.toLowerCase();
  if ((SALES_RETURN_HISTORY_LIST_CODES as readonly string[]).includes(lower)) {
    return lower;
  }
  return trimmed;
}

export function parseSalesListStatusFilter(
  value: string | undefined,
): SalesListStatusFilter | undefined {
  if (!value?.trim()) return undefined;
  const canonical = canonicalSalesListStatusCode(value);
  if ((SALES_LIST_STATUS_CODES as readonly string[]).includes(canonical)) {
    return canonical as (typeof SALES_LIST_STATUS_CODES)[number];
  }
  if (
    (SALES_RETURN_HISTORY_LIST_CODES as readonly string[]).includes(canonical)
  ) {
    return canonical as (typeof SALES_RETURN_HISTORY_LIST_CODES)[number];
  }
  return undefined;
}

export function salesListStatusCodesMatch(
  resolvedCode: string,
  filter: SalesListStatusFilter,
): boolean {
  return canonicalSalesListStatusCode(resolvedCode) === filter;
}

/** Return steps that keep Returned/Replaced on the sales list. */
const RETURN_HISTORY_STATUSES = [
  "pending_cs",
  "pending_tl",
  "approved",
  "completed",
] as const;

/**
 * Prisma filter: sale lines whose frozen inventory status is Sold / Official Sold /
 * TO FOLLOW.
 *
 * Default (KPIs, order analytics): open sales only. Closed ATR headers and
 * in-progress returns stay off those counts.
 *
 * Sales list (`includeReturnHistory`): also keeps returned and replaced sales,
 * including a closed ATR, so their status can stay Returned/Replaced. A rejected
 * return comes back as a normal open sale.
 */
export function salesListDetailWhere(
  tenantId: string,
  options?: { includeReturnHistory?: boolean },
): Prisma.BranchSalesTransactionDetailWhereInput {
  const openSale: Prisma.BranchSalesTransactionWhereInput = {
    tenantId,
    atrStatus: { not: "closed" },
    OR: [
      { returnRequest: { is: null } },
      { returnRequest: { is: { status: "completed" } } },
    ],
  };

  const sale: Prisma.BranchSalesTransactionWhereInput = options?.includeReturnHistory
    ? {
        tenantId,
        OR: [
          {
            atrStatus: { not: "closed" },
            OR: [
              { returnRequest: { is: null } },
              { returnRequest: { is: { status: "rejected" } } },
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
      {
        sale,
      },
      {
        OR: [
          {
            statusCode: {
              code: { in: [...SALES_LIST_STATUS_CODES] },
            },
          },
          // Legacy TO FOLLOW rows before statusCode was frozen on details.
          {
            statusCodeId: null,
            serialNumberId: null,
            sale: { atrStatus: { not: "reserve" } },
          },
        ],
      },
    ],
  };
}
