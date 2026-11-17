import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";

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

  async listPullouts(
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
      prisma.serviceCenterPullout.count({ where }),
      prisma.serviceCenterPullout.findMany({
        where,
        include: {
          serviceCenter: {
            select: { id: true, name: true, sapCode: true },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          statusCode: {
            select: { id: true, code: true, name: true, color: true },
          },
          details: {
            include: {
              serialNumber: { select: { id: true, serialNo: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
