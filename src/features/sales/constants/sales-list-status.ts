import type { Prisma } from "@prisma/client";

/**
 * Sale line status codes that belong on the Sales list / KPIs.
 * Return workflow (Pending CS/TL, Approved, Rejected, Closed) and RSV live on Returns.
 */
export const SALES_LIST_STATUS_CODES = ["SLD", "OFS", "FW"] as const;

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
