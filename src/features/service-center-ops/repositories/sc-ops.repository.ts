import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";

export const scOpsRepository = {
  async listInventory(
    tenantId: string,
    serviceCenterIds: string[] | null,
    pagination: PaginationInput,
    filters?: { statusCodeId?: string; serviceCenterId?: string },
  ) {
    const { page, limit, skip, take } = resolvePagination(pagination);
    const where = {
      tenantId,
      ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      ...(filters?.serviceCenterId
        ? { serviceCenterId: filters.serviceCenterId }
        : {}),
      ...(filters?.statusCodeId ? { statusCodeId: filters.statusCodeId } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.serviceCenterInventory.count({ where }),
      prisma.serviceCenterInventory.findMany({
        where,
        include: {
          statusCode: {
            select: { id: true, code: true, name: true, color: true },
          },
          serviceCenter: {
            select: { id: true, name: true, sapCode: true },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          serialNumber: {
            include: {
              model: {
                select: {
                  skuCode: true,
                  name: true,
                  brand: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  async listSales(
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
      prisma.serviceCenterSalesTransaction.count({ where }),
      prisma.serviceCenterSalesTransaction.findMany({
        where,
        include: {
          serviceCenter: {
            select: { id: true, name: true, sapCode: true },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          serialNumber: {
            select: {
              id: true,
              serialNo: true,
              model: { select: { skuCode: true, name: true } },
            },
          },
          returnRequest: {
            select: {
              id: true,
              status: true,
              requestNotes: true,
              evaluationNotes: true,
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
            select: { id: true, name: true, sapCode: true },
          },
          serviceCenterLocation: {
            select: { id: true, name: true, code: true },
          },
          statusCode: {
            select: { id: true, code: true, name: true, color: true },
          },
          order: { select: { id: true, orderNumber: true, status: true } },
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
