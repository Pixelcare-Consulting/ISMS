import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma, ReturnRequestStatus } from "@prisma/client";

export type SalesListSort =
  | "transactionNo"
  | "date"
  | "branch"
  | "customer"
  | "amount"
  | "atrStatus"
  | "returnStatus";
export type SalesListSortDir = "asc" | "desc";

/** Sort keys for the Returns tab (one row per BranchReturnRequest). */
export type SalesReturnsListSort =
  | "transactionNo"
  | "date"
  | "branch"
  | "customer"
  | "amount"
  | "atrStatus"
  | "returnStatus"
  | "createdAt";

function salesDetailPrismaOrderBy(
  field: SalesListSort,
  dir: SalesListSortDir,
): Prisma.BranchSalesTransactionDetailOrderByWithRelationInput {
  switch (field) {
    case "transactionNo":
      return { sale: { transactionNo: dir } };
    case "date":
      return { sale: { transactionDate: dir } };
    case "branch":
      return { sale: { branch: { name: dir } } };
    case "customer":
      return { sale: { customerName: dir } };
    case "amount":
      return { saleAmount: dir };
    case "atrStatus":
      return { sale: { atrStatus: dir } };
    case "returnStatus":
      return { sale: { returnRequest: { status: dir } } };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

function salesReturnPrismaOrderBy(
  field: SalesReturnsListSort,
  dir: SalesListSortDir,
): Prisma.BranchReturnRequestOrderByWithRelationInput {
  switch (field) {
    case "transactionNo":
      return { sale: { transactionNo: dir } };
    case "date":
      return { sale: { transactionDate: dir } };
    case "branch":
      return { sale: { branch: { name: dir } } };
    case "customer":
      return { sale: { customerName: dir } };
    case "amount":
      return { sale: { amount: dir } };
    case "atrStatus":
      return { sale: { atrStatus: dir } };
    case "returnStatus":
      return { status: dir };
    case "createdAt":
      return { createdAt: dir };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

const detailStatusCodeSelect = {
  statusCode: { select: { code: true, name: true, color: true } },
} as const;

export const salesRepository = {
  /**
   * One list row per transaction detail (serial line), newest sales first by default.
   */
  async listDetailsForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: SalesListSort; dir?: SalesListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchSalesTransactionDetailWhereInput = {
      sale: { tenantId },
    };
    const orderBy = sort?.field
      ? [
          salesDetailPrismaOrderBy(sort.field, sort.dir ?? "desc"),
          { createdAt: "asc" as const },
        ]
      : [{ sale: { createdAt: "desc" as const } }, { createdAt: "asc" as const }];

    const [items, total] = await Promise.all([
      prisma.branchSalesTransactionDetail.findMany({
        where,
        include: {
          ...detailStatusCodeSelect,
          serialNumber: {
            select: {
              id: true,
              serialNo: true,
            },
          },
          packageType: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          model: { select: { id: true, skuCode: true, name: true } },
          sale: {
            select: {
              id: true,
              transactionNo: true,
              transactionDate: true,
              customerName: true,
              atrStatus: true,
              branchId: true,
              alternateBranchId: true,
              branch: { select: { id: true, name: true } },
              returnRequest: { select: { id: true, status: true } },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchSalesTransactionDetail.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  /**
   * One list row per branch return request (sale + return pipeline grain).
   * Includes all statuses so the Returns tab is a full ledger.
   */
  async listReturnRequestsForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: SalesReturnsListSort; dir?: SalesListSortDir },
    options?: { statusIn?: ReturnRequestStatus[] },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchReturnRequestWhereInput = {
      tenantId,
      ...(options?.statusIn?.length
        ? { status: { in: options.statusIn } }
        : {}),
    };
    const orderBy = sort?.field
      ? [
          salesReturnPrismaOrderBy(sort.field, sort.dir ?? "desc"),
          { createdAt: "desc" as const },
        ]
      : [{ createdAt: "desc" as const }];

    const [items, total] = await Promise.all([
      prisma.branchReturnRequest.findMany({
        where,
        select: {
          id: true,
          status: true,
          requestNotes: true,
          createdAt: true,
          sale: {
            select: {
              id: true,
              transactionNo: true,
              transactionDate: true,
              customerName: true,
              amount: true,
              atrStatus: true,
              branch: { select: { id: true, name: true } },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchReturnRequest.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  /**
   * Full sale header + all detail lines for the View details dialog.
   */
  async findSaleDetailsForTenant(tenantId: string, saleId: string) {
    return prisma.branchSalesTransaction.findFirst({
      where: { id: saleId, tenantId },
      select: {
        id: true,
        branchId: true,
        alternateBranchId: true,
        paymentTypeId: true,
        saleTypeId: true,
        customerDeliveryMethodId: true,
        transactionNo: true,
        transactionDate: true,
        customerName: true,
        contactNo: true,
        siTrans: true,
        infoSlipVsoRrReleased: true,
        rrReceiveDeliver: true,
        atrStatus: true,
        notes: true,
        proof: true,
        amount: true,
        branch: { select: { id: true, name: true } },
        stockSourceBranch: { select: { id: true, name: true } },
        paymentType: { select: { id: true, name: true } },
        saleType: { select: { id: true, name: true } },
        customerDeliveryMethod: { select: { id: true, name: true } },
        returnRequest: { select: { id: true, status: true } },
        createdBy: { select: { name: true, email: true } },
        details: {
          orderBy: { createdAt: "asc" as const },
          select: {
            id: true,
            serialNumberId: true,
            modelId: true,
            saleAmount: true,
            amount: true,
            modelPrice: true,
            deliveryNo: true,
            deliveryDate: true,
            ...detailStatusCodeSelect,
            packageType: { select: { name: true } },
            brand: { select: { name: true } },
            model: { select: { id: true, skuCode: true, name: true } },
            serialNumber: {
              select: {
                id: true,
                serialNo: true,
              },
            },
          },
        },
      },
    });
  },
};
