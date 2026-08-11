import type { Prisma } from "@prisma/client";

/**
 * Sale line status codes that belong on the Sales list / KPIs.
 * Return workflow (Pending CS/TL, Approved, Rejected, Closed) and RSV live on Returns.
 */
export const SALES_LIST_STATUS_CODES = ["SLD", "OFS", "FW"] as const;

/**
 * Prisma filter: sale lines whose frozen inventory status is Sold / Official Sold /
 * TO FOLLOW, excluding closed ATR headers and active (non-completed) return requests.
 */
export function salesListDetailWhere(
  tenantId: string,
): Prisma.BranchSalesTransactionDetailWhereInput {
  return {
    AND: [
      {
        sale: {
          tenantId,
          atrStatus: { not: "closed" },
          OR: [
            { returnRequest: { is: null } },
            { returnRequest: { is: { status: "completed" } } },
          ],
        },
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
