import type { LookupRecordStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";

const serialListInclude = {
  model: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      brand: { select: { name: true } },
    },
  },
  branchInventories: {
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: {
      updatedAt: true,
      branch: { select: { id: true, name: true } },
      statusCode: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.SerialNumberInclude;

const serialTraceabilityInclude = {
  model: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      brand: { select: { name: true } },
    },
  },
  branchInventories: {
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      updatedAt: true,
      branch: { select: { name: true } },
      statusCode: { select: { code: true, name: true } },
    },
  },
  branchSales: {
    select: {
      id: true,
      transactionNo: true,
      amount: true,
      atrStatus: true,
      createdAt: true,
      branch: { select: { name: true } },
      returnRequest: { select: { id: true, status: true, createdAt: true } },
    },
  },
  transferLines: {
    select: {
      id: true,
      transfer: {
        select: {
          id: true,
          transferNo: true,
          createdAt: true,
          fromBranch: { select: { name: true } },
          toBranch: { select: { name: true } },
          statusCode: { select: { code: true, name: true } },
        },
      },
    },
  },
  pulloutLines: {
    select: {
      id: true,
      pullout: {
        select: {
          id: true,
          pulloutNo: true,
          createdAt: true,
          branch: { select: { name: true } },
          warehouse: { select: { name: true } },
          statusCode: { select: { code: true, name: true } },
        },
      },
    },
  },
  stockCountLines: {
    select: {
      id: true,
      status: true,
      countedAt: true,
      session: {
        select: {
          id: true,
          sessionNo: true,
          createdAt: true,
          branch: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.SerialNumberInclude;

export type SerialTraceabilityRow = Prisma.SerialNumberGetPayload<{
  include: typeof serialTraceabilityInclude;
}>;

export const serialNumberRepository = {
  async list(
    tenantId: string,
    pagination?: { page?: number; limit?: number },
    filters?: { q?: string; status?: LookupRecordStatus },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const q = filters?.q?.trim();

    const where: Prisma.SerialNumberWhereInput = {
      tenantId,
      ...(filters?.status ? { recordStatus: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { serialNo: { contains: q, mode: "insensitive" } },
              { model: { skuCode: { contains: q, mode: "insensitive" } } },
              { model: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.serialNumber.findMany({
        where,
        include: serialListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.serialNumber.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  findById(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({ where: { id, tenantId } });
  },

  getTraceability(tenantId: string, id: string) {
    return prisma.serialNumber.findFirst({
      where: { id, tenantId },
      include: serialTraceabilityInclude,
    });
  },

  findModelInTenant(tenantId: string, modelId: string) {
    return prisma.productModel.findFirst({
      where: { id: modelId, tenantId },
      select: { id: true },
    });
  },

  listModelOptions(tenantId: string) {
    return prisma.productModel.findMany({
      where: { tenantId },
      orderBy: { skuCode: "asc" },
      select: { id: true, skuCode: true, name: true },
    });
  },

  create(tenantId: string, data: { serialNo: string; modelId: string }) {
    return prisma.serialNumber.create({ data: { tenantId, ...data } });
  },

  update(
    tenantId: string,
    id: string,
    data: { serialNo: string; modelId: string },
  ) {
    return prisma.serialNumber.update({ where: { id, tenantId }, data });
  },

  setStatus(tenantId: string, id: string, recordStatus: LookupRecordStatus) {
    return prisma.serialNumber.update({
      where: { id, tenantId },
      data: { recordStatus },
    });
  },
};
