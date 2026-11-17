import { serviceCenterSalesListDetailWhere } from "@/features/sales/constants/sales-list-status";
import type { SalesListSort, SalesListSortDir } from "@/features/sales/repositories/sales.repository";
import type { SaleDetailsSource } from "@/features/sales/services/sale-details-payload";
import type {
  SalesLineStatusSource,
  SalesListLine,
} from "@/features/sales/services/sales-list.service";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";

/**
 * Service center sale lines in the shared sales shapes: `branch` is the service center
 * (sold place) and `stockSourceBranch` its stock-source location.
 */

/** Older SC walk-in returns have no document type; they read as Service Returned. */
const SC_RETURN_DOCUMENT_TYPE = { name: "Service Return" } as const;

const returnRefSelect = {
  select: { id: true, status: true, saleDetailId: true, documentType: { select: { name: true } } },
} as const;

type ScSort = { field?: SalesListSort; dir?: SalesListSortDir };

function scSalesLineOrderBy(
  sort?: ScSort,
): Prisma.ServiceCenterSalesTransactionDetailOrderByWithRelationInput[] {
  if (!sort?.field) return [{ sale: { createdAt: "desc" } }, { createdAt: "asc" }];
  const dir = sort.dir ?? "desc";
  return [scSalesLineSortKey(sort.field, dir), { createdAt: "asc" }];
}

function scSalesLineSortKey(
  field: SalesListSort,
  dir: SalesListSortDir,
): Prisma.ServiceCenterSalesTransactionDetailOrderByWithRelationInput {
  switch (field) {
    case "transactionNo":
      return { sale: { transactionNo: dir } };
    case "date":
      return { sale: { transactionDate: dir } };
    case "branch":
      return { sale: { serviceCenter: { name: dir } } };
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

/** "Location name (CODE)", the label SC pages already use for a location. */
export function scLocationLabel(location: { name: string; code: string }): string {
  return `${location.name} (${location.code})`;
}

function toLocationRef(location: { id: string; name: string; code: string } | null) {
  return location ? { id: location.id, name: scLocationLabel(location) } : null;
}

function toReturnRef(
  request: {
    id: string;
    status: string;
    saleDetailId: string | null;
    documentType: { name: string } | null;
  } | null,
) {
  return request
    ? {
        id: request.id,
        status: request.status,
        saleDetailId: request.saleDetailId,
        documentType: request.documentType ?? SC_RETURN_DOCUMENT_TYPE,
      }
    : null;
}

const locationSelect = { select: { id: true, name: true, code: true } } as const;

const scSalesLineInclude = {
  statusCode: { select: { code: true, name: true, color: true } },
  serialNumber: { select: { id: true, serialNo: true } },
  packageType: { select: { name: true } },
  brand: { select: { name: true } },
  model: { select: { skuCode: true, name: true } },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      atrStatus: true,
      serviceCenterId: true,
      serviceCenterLocationId: true,
      serviceCenter: { select: { id: true, name: true } },
      serviceCenterLocation: locationSelect,
      returnRequest: returnRefSelect,
    },
  },
} satisfies Prisma.ServiceCenterSalesTransactionDetailInclude;

type ScSalesLineRow = Prisma.ServiceCenterSalesTransactionDetailGetPayload<{
  include: typeof scSalesLineInclude;
}>;

function toSalesListLine(row: ScSalesLineRow): SalesListLine {
  const { sale } = row;
  return {
    ...row,
    sale: {
      id: sale.id,
      transactionNo: sale.transactionNo,
      transactionDate: sale.transactionDate,
      customerName: sale.customerName,
      atrStatus: sale.atrStatus,
      branchId: sale.serviceCenterId,
      alternateBranchId: sale.serviceCenterLocationId,
      branch: sale.serviceCenter,
      stockSourceBranch: toLocationRef(sale.serviceCenterLocation),
      returnRequest: toReturnRef(sale.returnRequest),
    },
  };
}

export const scSalesRepository = {
  async listLines(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: { page?: number; limit?: number },
    sort?: ScSort,
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = serviceCenterSalesListDetailWhere(tenantId, serviceCenterIds, {
      includeReturnHistory: true,
    });
    const [rows, total] = await Promise.all([
      prisma.serviceCenterSalesTransactionDetail.findMany({
        where,
        include: scSalesLineInclude,
        orderBy: scSalesLineOrderBy(sort),
        skip,
        take: limit,
      }),
      prisma.serviceCenterSalesTransactionDetail.count({ where }),
    ]);
    return toPaginatedResult(rows.map(toSalesListLine), total, page, limit);
  },

  /** Every listed line, in list order. STATUS, search, and the KPI cards read these. */
  async listStatusSources(
    tenantId: string,
    serviceCenterIds: string[] | null,
    sort?: ScSort,
  ): Promise<SalesLineStatusSource[]> {
    const rows = await prisma.serviceCenterSalesTransactionDetail.findMany({
      where: serviceCenterSalesListDetailWhere(tenantId, serviceCenterIds, {
        includeReturnHistory: true,
      }),
      include: scSalesLineInclude,
      orderBy: scSalesLineOrderBy(sort),
    });
    return rows.map(toSalesListLine);
  },

  async listLinesByIds(
    tenantId: string,
    serviceCenterIds: string[] | null,
    ids: string[],
  ) {
    if (ids.length === 0) return [];
    const rows = await prisma.serviceCenterSalesTransactionDetail.findMany({
      where: {
        id: { in: ids },
        sale: {
          tenantId,
          ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
        },
      },
      include: scSalesLineInclude,
    });
    const order = new Map(ids.map((id, index) => [id, index]));
    return rows
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .map(toSalesListLine);
  },

  /** Full header + lines for View details, or null outside the user's service centers. */
  async findSaleDetails(
    tenantId: string,
    serviceCenterIds: string[] | null,
    saleId: string,
  ): Promise<(SaleDetailsSource & { serviceCenterId: string }) | null> {
    const sale = await prisma.serviceCenterSalesTransaction.findFirst({
      where: {
        id: saleId,
        tenantId,
        ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      },
      select: {
        id: true,
        serviceCenterId: true,
        serviceCenterLocationId: true,
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
        serviceCenter: { select: { id: true, name: true } },
        serviceCenterLocation: locationSelect,
        paymentType: { select: { id: true, name: true } },
        saleType: { select: { id: true, name: true } },
        customerDeliveryMethod: { select: { id: true, name: true } },
        returnRequest: returnRefSelect,
        createdBy: { select: { name: true, email: true } },
        details: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            serialNumberId: true,
            modelId: true,
            saleAmount: true,
            amount: true,
            modelPrice: true,
            deliveryNo: true,
            deliveryDate: true,
            statusCode: { select: { code: true, name: true, color: true } },
            packageType: { select: { name: true } },
            brand: { select: { name: true } },
            model: { select: { id: true, skuCode: true, name: true } },
            serialNumber: { select: { id: true, serialNo: true } },
          },
        },
      },
    });
    if (!sale) return null;

    const { serviceCenter, serviceCenterLocation, serviceCenterLocationId, ...rest } = sale;
    return {
      ...rest,
      branchId: sale.serviceCenterId,
      alternateBranchId: serviceCenterLocationId,
      branch: serviceCenter,
      stockSourceBranch: toLocationRef(serviceCenterLocation),
      returnRequest: toReturnRef(sale.returnRequest),
    };
  },

  /** Proof attachments of one sale, or null outside the user's service centers. */
  async findSaleProof(tenantId: string, serviceCenterIds: string[] | null, saleId: string) {
    return prisma.serviceCenterSalesTransaction.findFirst({
      where: {
        id: saleId,
        tenantId,
        ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      },
      select: { proof: true },
    });
  },

  /**
   * SC sales with an older walk-in return request (Service Returns ledger), with their line
   * serials. Service Returns / Replacements (Process V-b) are finished in SC Returns instead.
   */
  async listReturnSales(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: { page?: number; limit?: number },
    options?: { statusIn?: Prisma.EnumReturnRequestStatusFilter["in"] },
  ) {
    const { page, limit, skip } = resolvePagination(pagination);
    const where: Prisma.ServiceCenterSalesTransactionWhereInput = {
      tenantId,
      ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      returnRequest: {
        is: {
          documentTypeId: null,
          ...(options?.statusIn?.length ? { status: { in: options.statusIn } } : {}),
        },
      },
    };

    const [total, rows] = await Promise.all([
      prisma.serviceCenterSalesTransaction.count({ where }),
      prisma.serviceCenterSalesTransaction.findMany({
        where,
        include: {
          serviceCenter: { select: { id: true, name: true, sapCode: true } },
          serviceCenterLocation: locationSelect,
          details: {
            orderBy: { createdAt: "asc" },
            select: { serialNumber: { select: { serialNo: true } } },
          },
          returnRequest: {
            select: {
              id: true,
              status: true,
              requestNotes: true,
              evaluationNotes: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const items = rows.map(({ details, ...row }) => ({
      ...row,
      serialNos: details
        .map((detail) => detail.serialNumber?.serialNo)
        .filter((serialNo): serialNo is string => Boolean(serialNo)),
    }));
    return toPaginatedResult(items, total, page, limit);
  },
};
