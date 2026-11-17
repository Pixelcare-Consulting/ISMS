import type { Prisma, ReturnRequestStatus } from "@prisma/client";

import { SC_SERVICE_OPEN_RETURN_STATUSES } from "@/features/sales/constants/return-history-status";
import { prisma } from "@/lib/database/client";

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

function statusWhere(filter: ScServiceReturnFilter): Prisma.BranchReturnRequestWhereInput {
  switch (filter) {
    case "open":
      return { status: { in: [...SC_SERVICE_OPEN_RETURN_STATUSES] } };
    case "pending_sc":
    case "awaiting_stock":
      return { status: filter };
    case "completed":
    case "rejected":
      // Only requests the service center finished, not older branch-finished service returns.
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

/** Service returns sent to a service center, limited to the user's service centers. */
function scopeWhere(
  tenantId: string,
  scopedServiceCenterIds: string[] | null,
): Prisma.BranchReturnRequestWhereInput {
  return {
    tenantId,
    serviceCenterId: scopedServiceCenterIds ? { in: scopedServiceCenterIds } : { not: null },
  };
}

function searchWhere(q: string): Prisma.BranchReturnRequestWhereInput | null {
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
  serviceCenter: { select: { id: true, name: true, sapCode: true } },
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
      branch: { select: { name: true } },
      details: {
        where: { serialNumberId: { not: null } },
        orderBy: { createdAt: "asc" as const },
        take: 1,
        select: {
          serialNumber: { select: { serialNo: true } },
          model: { select: { skuCode: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchReturnRequestSelect;

const detailSelect = {
  ...listSelect,
  saleDetailId: true,
  serviceCenterId: true,
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
  serviceCenter: {
    select: {
      id: true,
      name: true,
      sapCode: true,
      locations: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" as const } },
    },
  },
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      customerName: true,
      contactNo: true,
      branch: { select: { name: true } },
      details: {
        where: { serialNumberId: { not: null } },
        orderBy: { createdAt: "asc" as const },
        take: 1,
        select: {
          modelId: true,
          serialNumber: { select: { serialNo: true } },
          model: { select: { id: true, skuCode: true, name: true } },
        },
      },
      replacements: {
        where: { replacementServiceCenterId: { not: null } },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        select: {
          replacementNo: true,
          replacementSerialNumber: { select: { serialNo: true } },
        },
      },
    },
  },
} satisfies Prisma.BranchReturnRequestSelect;

export type ScServiceReturnListRow = Prisma.BranchReturnRequestGetPayload<{ select: typeof listSelect }>;
export type ScServiceReturnDetailRow = Prisma.BranchReturnRequestGetPayload<{
  select: typeof detailSelect;
}>;

export const scServiceReturnsRepository = {
  async list(
    tenantId: string,
    scopedServiceCenterIds: string[] | null,
    input: { page: number; limit: number; q: string; filter: ScServiceReturnFilter },
  ) {
    const search = searchWhere(input.q);
    const where: Prisma.BranchReturnRequestWhereInput = {
      AND: [
        scopeWhere(tenantId, scopedServiceCenterIds),
        statusWhere(input.filter),
        ...(search ? [search] : []),
      ],
    };
    const page = Math.max(1, input.page);
    const [items, total] = await Promise.all([
      prisma.branchReturnRequest.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * input.limit,
        take: input.limit,
      }),
      prisma.branchReturnRequest.count({ where }),
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
    const groups = await prisma.branchReturnRequest.groupBy({
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
    return prisma.branchReturnRequest.count({
      where: { ...scopeWhere(tenantId, scopedServiceCenterIds), status: "pending_sc" },
    });
  },

  findDetail(tenantId: string, scopedServiceCenterIds: string[] | null, id: string) {
    return prisma.branchReturnRequest.findFirst({
      where: { id, ...scopeWhere(tenantId, scopedServiceCenterIds) },
      select: detailSelect,
    });
  },
};
