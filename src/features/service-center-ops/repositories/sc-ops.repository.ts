import type { Prisma } from "@/lib/database/generated/prisma/client";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";

export type ScPulloutListSort = "pulloutNo" | "serviceCenter" | "reason" | "status";

function scPulloutWhere(
  tenantId: string,
  serviceCenterIds: string[] | null,
): Prisma.ServiceCenterPulloutWhereInput {
  return {
    tenantId,
    statusCodeId: { not: null },
    ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
  };
}

function scPulloutOrderBy(
  field: ScPulloutListSort,
  dir: "asc" | "desc",
): Prisma.ServiceCenterPulloutOrderByWithRelationInput {
  switch (field) {
    case "pulloutNo":
      return { pulloutNo: dir };
    case "serviceCenter":
      return { serviceCenter: { name: dir } };
    case "reason":
      return { reasonStatusCode: { name: dir } };
    case "status":
      return { statusCode: { code: dir } };
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

export const scOpsRepository = {
  async listOrders(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: PaginationInput,
  ) {
    const { page, limit, skip, take } = resolvePagination(pagination);
    const where = {
      tenantId,
      ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.serviceCenterOrder.count({ where }),
      prisma.serviceCenterOrder.findMany({
        where,
        include: {
          serviceCenter: {
            select: { id: true, name: true, sapCode: true },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          details: {
            include: {
              model: { select: { id: true, skuCode: true, name: true } },
            },
          },
          deliveries: {
            where: { sapDocEntry: { not: null } },
            select: { id: true, sapDocNo: true },
            orderBy: { sapDocEntry: "asc" },
          },
          _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  async listDeliveries(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: PaginationInput,
  ) {
    const { page, limit, skip, take } = resolvePagination(pagination);
    const where = {
      tenantId,
      ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.serviceCenterDelivery.count({ where }),
      prisma.serviceCenterDelivery.findMany({
        where,
        include: {
          serviceCenter: {
            select: {
              id: true,
              name: true,
              sapCode: true,
              // Accept asks for one when a SAP delivery arrived without a location.
              locations: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
            },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          statusCode: {
            select: { id: true, code: true, name: true, color: true },
          },
          order: { select: { id: true, orderNumber: true, status: true } },
          // The SAP DR's serials; empty on deliveries made in ISMS before Check SAP.
          lines: {
            select: {
              serialNumberId: true,
              acceptedAt: true,
              serialNumber: {
                select: { serialNo: true, model: { select: { skuCode: true } } },
              },
            },
            orderBy: { serialNumber: { serialNo: "asc" } },
          },
          _count: { select: { backloads: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  /** SC pull-outs in scope, shaped like the branch pull-out list rows. */
  async listPullouts(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: PaginationInput,
    sort?: { field?: ScPulloutListSort; dir?: "asc" | "desc" },
  ) {
    const { page, limit, skip, take } = resolvePagination(pagination);
    const where = scPulloutWhere(tenantId, serviceCenterIds);
    const dir = sort?.dir ?? "desc";

    const [total, items] = await Promise.all([
      prisma.serviceCenterPullout.count({ where }),
      prisma.serviceCenterPullout.findMany({
        where,
        select: {
          id: true,
          pulloutNo: true,
          serviceCenter: { select: { name: true } },
          statusCode: { select: { id: true, code: true, name: true, color: true } },
          reasonStatusCode: { select: { id: true, code: true, name: true, color: true } },
        },
        orderBy: sort?.field ? scPulloutOrderBy(sort.field, dir) : { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    // `scPulloutWhere` leaves out rows with no status, so every row has one.
    const rows = items.flatMap(({ serviceCenter, statusCode, ...row }) =>
      statusCode ? [{ ...row, statusCode, place: serviceCenter }] : [],
    );
    return toPaginatedResult(rows, total, page, limit);
  },

  countPulloutsByStatus(tenantId: string, serviceCenterIds: string[] | null) {
    return prisma.serviceCenterPullout.groupBy({
      by: ["statusCodeId"],
      where: scPulloutWhere(tenantId, serviceCenterIds),
      _count: { id: true },
    });
  },

  countAllPullouts(tenantId: string, serviceCenterIds: string[] | null) {
    return prisma.serviceCenterPullout.count({ where: scPulloutWhere(tenantId, serviceCenterIds) });
  },
};
