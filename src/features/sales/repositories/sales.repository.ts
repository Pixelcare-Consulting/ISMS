import { SERVICE_DOCUMENT_TYPE_NAMES } from "@/features/sales/constants/process-return";
import { salesListDetailWhere } from "@/features/sales/constants/sales-list-status";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";
import type { Prisma, ReturnRequestStatus } from "@prisma/client";

export type BranchReturnDocumentTypeScope = "branch" | "service";

export function branchReturnDocumentTypeScopeWhere(
  scope: BranchReturnDocumentTypeScope | undefined,
): Prisma.BranchReturnRequestWhereInput {
  if (!scope) return {};

  const serviceNameFilter: Prisma.StringFilter = {
    in: [...SERVICE_DOCUMENT_TYPE_NAMES],
    mode: "insensitive",
  };

  if (scope === "service") {
    return {
      documentType: {
        is: {
          name: serviceNameFilter,
        },
      },
    };
  }

  return {
    OR: [
      { documentTypeId: null },
      {
        NOT: {
          documentType: {
            is: {
              name: serviceNameFilter,
            },
          },
        },
      },
    ],
  };
}

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

function salesDetailListOrderBy(sort?: {
  field?: SalesListSort;
  dir?: SalesListSortDir;
}): Prisma.BranchSalesTransactionDetailOrderByWithRelationInput[] {
  return sort?.field
    ? [
        salesDetailPrismaOrderBy(sort.field, sort.dir ?? "desc"),
        { createdAt: "asc" },
      ]
    : [{ sale: { createdAt: "desc" } }, { createdAt: "asc" }];
}

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

const salesDetailListInclude = {
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
      stockSourceBranch: { select: { id: true, name: true } },
      returnRequest: {
        select: {
          id: true,
          status: true,
          saleDetailId: true,
          documentType: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchSalesTransactionDetailInclude;

const salesDetailStatusSourceSelect = {
  id: true,
  serialNumberId: true,
  saleAmount: true,
  amount: true,
  modelPrice: true,
  statusCode: { select: { code: true, name: true, color: true } },
  serialNumber: { select: { serialNo: true } },
  packageType: { select: { name: true } },
  brand: { select: { name: true } },
  model: { select: { skuCode: true, name: true } },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      customerName: true,
      atrStatus: true,
      branch: { select: { name: true } },
      stockSourceBranch: { select: { name: true } },
      returnRequest: {
        select: {
          status: true,
          saleDetailId: true,
          documentType: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchSalesTransactionDetailSelect;

export const salesRepository = {
  /**
   * One list row per transaction detail (serial line), newest sales first by default.
   * Sold / Official Sold / TO FOLLOW, plus returned and replaced lines so their
   * status can stay Returned/Replaced or Service Returned/Replaced.
   */
  async listDetailsForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: SalesListSort; dir?: SalesListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = salesListDetailWhere(tenantId, { includeReturnHistory: true });
    const orderBy = salesDetailListOrderBy(sort);

    const [items, total] = await Promise.all([
      prisma.branchSalesTransactionDetail.findMany({
        where,
        include: salesDetailListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchSalesTransactionDetail.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  /**
   * Every sales-list line, in list order, with only the fields STATUS needs.
   * Callers resolve Returned/Replaced before counting or filtering.
   */
  listDetailStatusSources(
    tenantId: string,
    sort?: { field?: SalesListSort; dir?: SalesListSortDir },
  ) {
    return prisma.branchSalesTransactionDetail.findMany({
      where: salesListDetailWhere(tenantId, { includeReturnHistory: true }),
      select: salesDetailStatusSourceSelect,
      orderBy: salesDetailListOrderBy(sort),
    });
  },

  /** Full list rows for an already ordered page of detail ids. */
  async listDetailsByIds(tenantId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const items = await prisma.branchSalesTransactionDetail.findMany({
      where: {
        id: { in: ids },
        sale: { tenantId },
      },
      include: salesDetailListInclude,
    });
    const order = new Map(ids.map((id, index) => [id, index]));
    return items.sort(
      (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    );
  },

  /**
   * One list row per branch return request (sale + return pipeline grain).
   * Includes all statuses so the Returns tab is a full ledger.
   */
  async listReturnRequestsForTenant(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    sort?: { field?: SalesReturnsListSort; dir?: SalesListSortDir },
    options?: {
      statusIn?: ReturnRequestStatus[];
      documentTypeScope?: BranchReturnDocumentTypeScope;
    },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.BranchReturnRequestWhereInput = {
      tenantId,
      ...(options?.statusIn?.length
        ? { status: { in: options.statusIn } }
        : {}),
      ...branchReturnDocumentTypeScopeWhere(options?.documentTypeScope),
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
          actionType: true,
          stockStatusCode: true,
          requestNotes: true,
          problemDescriptionText: true,
          dealerRsNo: true,
          actualDateReturned: true,
          atrOdrfPdfPath: true,
          saleDetailId: true,
          createdAt: true,
          documentType: { select: { id: true, name: true } },
          sale: {
            select: {
              id: true,
              transactionNo: true,
              transactionDate: true,
              customerName: true,
              amount: true,
              atrStatus: true,
              branch: { select: { id: true, name: true } },
              details: {
                orderBy: { createdAt: "asc" as const },
                select: {
                  id: true,
                  saleAmount: true,
                  modelPrice: true,
                  model: { select: { skuCode: true, name: true } },
                  serialNumber: { select: { id: true, serialNo: true } },
                },
              },
              replacements: {
                orderBy: { createdAt: "desc" as const },
                take: 1,
                select: {
                  replacementNo: true,
                  replacementAmount: true,
                  replacementInvoiceNo: true,
                  replacementInvoiceDate: true,
                  replacementBranch: { select: { id: true, name: true } },
                  replacementSerialNumber: {
                    select: { id: true, serialNo: true },
                  },
                },
              },
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
        returnRequest: {
          select: {
            id: true,
            status: true,
            saleDetailId: true,
            actionType: true,
            stockStatusCode: true,
            atrOdrfPdfPath: true,
            documentType: { select: { name: true } },
          },
        },
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
