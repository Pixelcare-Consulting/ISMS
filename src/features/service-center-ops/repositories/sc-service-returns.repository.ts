import type { ReturnRequestStatus } from "@prisma/client";

import { SC_SERVICE_OPEN_RETURN_STATUSES } from "@/features/sales/constants/return-history-status";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";

/** List filter on the SC Returns page. `open` is everything the SC still has to finish. */
export const SC_SERVICE_RETURN_FILTERS = [
  "open",
  "pending_sc",
  "awaiting_stock",
  "completed",
  "rejected",
  "all",
] as const;

export type ScServiceReturnFilter = (typeof SC_SERVICE_RETURN_FILTERS)[number];

export function parseScServiceReturnFilter(value: string | undefined): ScServiceReturnFilter {
  return (SC_SERVICE_RETURN_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as ScServiceReturnFilter)
    : "open";
}

function statusWhere(filter: ScServiceReturnFilter): Prisma.ServiceCenterReturnRequestWhereInput {
  switch (filter) {
    case "open":
      return { status: { in: [...SC_SERVICE_OPEN_RETURN_STATUSES] } };
    case "pending_sc":
    case "awaiting_stock":
      return { status: filter };
    case "completed":
    case "rejected":
      return { status: filter, inspectedAt: { not: null } };
    case "all":
      return {
        OR: [
          { status: { in: [...SC_SERVICE_OPEN_RETURN_STATUSES] } },
          { status: { in: ["completed", "rejected"] }, inspectedAt: { not: null } },
        ],
      };
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

/**
 * Service Return / Replacement requests (they carry a document type; the older SC walk-in
 * returns do not), limited to the user's service centers.
 */
function scopeWhere(
  tenantId: string,
  scopedServiceCenterIds: string[] | null,
): Prisma.ServiceCenterReturnRequestWhereInput {
  return {
    tenantId,
    documentTypeId: { not: null },
    ...(scopedServiceCenterIds ? { sale: { serviceCenterId: { in: scopedServiceCenterIds } } } : {}),
  };
}

function searchWhere(q: string): Prisma.ServiceCenterReturnRequestWhereInput | null {
  const term = q.trim();
  if (!term) return null;
  const contains = { contains: term, mode: "insensitive" as const };
  return {
    OR: [
      { sale: { transactionNo: contains } },
      { sale: { siTrans: contains } },
      { sale: { customerName: contains } },
      { saleDetail: { serialNumber: { serialNo: contains } } },
      { sale: { details: { some: { serialNumber: { serialNo: contains } } } } },
    ],
  };
}

const listSelect = {
  id: true,
  status: true,
  actionType: true,
  stockStatusCode: true,
  problemDescriptionText: true,
  createdAt: true,
  inspectedAt: true,
  documentType: { select: { name: true } },
  specialOrder: { select: { orderNumber: true, status: true } },
  saleDetail: {
    select: {
      serialNumber: { select: { serialNo: true } },
      model: { select: { skuCode: true, name: true } },
    },
  },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      serviceCenter: { select: { id: true, name: true, sapCode: true } },
    },
  },
} satisfies Prisma.ServiceCenterReturnRequestSelect;

const detailSelect = {
  ...listSelect,
  saleDetailId: true,
  heldSerialNumberId: true,
  classification: true,
  natureOfTransaction: true,
  refContactPo: true,
  customerDealerBranch: true,
  evaluationNotes: true,
  completedAt: true,
  atrOdrfPdfPath: true,
  serviceModel: { select: { skuCode: true, name: true } },
  requestedBy: { select: { name: true, email: true } },
  inspectedBy: { select: { name: true, email: true } },
  serviceCenterLocation: { select: { code: true, name: true } },
  heldSerialNumber: { select: { serialNo: true } },
  replacementSerialNumber: { select: { serialNo: true } },
  specialOrder: {
    select: { id: true, orderNumber: true, status: true, sapDocNum: true, createdAt: true },
  },
  saleDetail: {
    select: {
      modelId: true,
      serialNumber: { select: { serialNo: true } },
      model: { select: { id: true, skuCode: true, name: true } },
    },
  },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      contactNo: true,
      serviceCenter: {
        select: {
          id: true,
          name: true,
          sapCode: true,
          locations: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" as const } },
        },
      },
    },
  },
} satisfies Prisma.ServiceCenterReturnRequestSelect;

export type ScServiceReturnListRow = Prisma.ServiceCenterReturnRequestGetPayload<{ select: typeof listSelect }>;
export type ScServiceReturnDetailRow = Prisma.ServiceCenterReturnRequestGetPayload<{
  select: typeof detailSelect;
}>;

export const scServiceReturnsRepository = {
  async list(
    tenantId: string,
    scopedServiceCenterIds: string[] | null,
    input: { page: number; limit: number; q: string; filter: ScServiceReturnFilter },
  ) {
    const search = searchWhere(input.q);
    const where: Prisma.ServiceCenterReturnRequestWhereInput = {
      AND: [
        scopeWhere(tenantId, scopedServiceCenterIds),
        statusWhere(input.filter),
        ...(search ? [search] : []),
      ],
    };
    const page = Math.max(1, input.page);
    const [items, total] = await Promise.all([
      prisma.serviceCenterReturnRequest.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * input.limit,
        take: input.limit,
      }),
      prisma.serviceCenterReturnRequest.count({ where }),
    ]);
    return {
      items,
      total,
      page,
      limit: input.limit,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    };
  },

  /** Open requests per status, for the KPI strip. */
  async countOpenByStatus(tenantId: string, scopedServiceCenterIds: string[] | null) {
    const groups = await prisma.serviceCenterReturnRequest.groupBy({
      by: ["status"],
      where: {
        ...scopeWhere(tenantId, scopedServiceCenterIds),
        status: { in: [...SC_SERVICE_OPEN_RETURN_STATUSES] },
      },
      _count: { id: true },
    });
    const count = (status: ReturnRequestStatus) =>
      groups.find((group) => group.status === status)?._count.id ?? 0;
    return { pendingSc: count("pending_sc"), awaitingStock: count("awaiting_stock") };
  },

  /** Requests the service center can act on now (sidebar badge). */
  countPendingSc(tenantId: string, scopedServiceCenterIds: string[] | null) {
    return prisma.serviceCenterReturnRequest.count({
      where: { ...scopeWhere(tenantId, scopedServiceCenterIds), status: "pending_sc" },
    });
  },

  findDetail(tenantId: string, scopedServiceCenterIds: string[] | null, id: string) {
    return prisma.serviceCenterReturnRequest.findFirst({
      where: { id, ...scopeWhere(tenantId, scopedServiceCenterIds) },
      select: detailSelect,
    });
  },
};
