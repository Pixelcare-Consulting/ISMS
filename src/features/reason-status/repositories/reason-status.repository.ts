import type { LookupRecordStatus, ReasonStatusCategory } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import {
  CACHE_TTL,
  cacheKey,
  deleteCache,
  getOrSet,
} from "@/lib/cache/redis";

async function invalidateReasonStatusCache(tenantId: string) {
  await Promise.all([
    deleteCache(cacheKey("tenant", tenantId, "reason-status", "all")),
    deleteCache(
      cacheKey("tenant", tenantId, "reason-status", "active", "inventory_system"),
    ),
    deleteCache(
      cacheKey("tenant", tenantId, "reason-status", "active", "pullout_reason"),
    ),
    deleteCache(
      cacheKey("tenant", tenantId, "reason-status", "active", "delivery_workflow"),
    ),
    deleteCache(
      cacheKey("tenant", tenantId, "reason-status", "active", "transfer_workflow"),
    ),
    deleteCache(
      cacheKey("tenant", tenantId, "reason-status", "active", "pullout_workflow"),
    ),
  ]);
}

export const reasonStatusRepository = {
  listByTenant(tenantId: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "reason-status", "all"),
      CACHE_TTL.reasonCodes,
      () =>
        prisma.reasonStatus.findMany({
          where: { tenantId },
          include: {
            codes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          },
          orderBy: [{ category: "asc" }, { name: "asc" }],
        }),
    );
  },

  listActiveCodesByCategory(tenantId: string, category: ReasonStatusCategory) {
    return getOrSet(
      cacheKey("tenant", tenantId, "reason-status", "active", category),
      CACHE_TTL.reasonCodes,
      () =>
        prisma.reasonStatusCode.findMany({
          where: {
            tenantId,
            recordStatus: "active",
            reasonStatus: { category, recordStatus: "active" },
          },
          include: { reasonStatus: { select: { name: true, category: true } } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        }),
    );
  },

  findCodeId(tenantId: string, category: ReasonStatusCategory, code: string) {
    return getOrSet(
      cacheKey("tenant", tenantId, "reason-status", "code", category, code),
      CACHE_TTL.reasonCodes,
      () =>
        prisma.reasonStatusCode.findFirst({
          where: {
            tenantId,
            code,
            recordStatus: "active",
            reasonStatus: { category, recordStatus: "active" },
          },
          select: { id: true, name: true, code: true, color: true },
        }),
    );
  },

  findGroup(tenantId: string, category: ReasonStatusCategory) {
    return prisma.reasonStatus.findFirst({
      where: { tenantId, category, recordStatus: "active" },
      include: {
        codes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });
  },

  async createCode(input: {
    tenantId: string;
    reasonStatusId: string;
    name: string;
    code: string;
    color?: string | null;
    sortOrder?: number;
  }) {
    const row = await prisma.reasonStatusCode.create({
      data: {
        tenantId: input.tenantId,
        reasonStatusId: input.reasonStatusId,
        name: input.name,
        code: input.code.toUpperCase(),
        color: input.color ?? "slate",
        sortOrder: input.sortOrder ?? 0,
        isSystem: false,
      },
    });
    await invalidateReasonStatusCache(input.tenantId);
    return row;
  },

  async updateCode(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      recordStatus?: LookupRecordStatus;
      sortOrder?: number;
      color?: string | null;
    },
  ) {
    const row = await prisma.reasonStatusCode.update({
      where: { id, tenantId },
      data,
    });
    await invalidateReasonStatusCache(tenantId);
    return row;
  },

  countCodeUsage(tenantId: string, codeId: string) {
    return Promise.all([
      prisma.branchInventory.count({ where: { tenantId, statusCodeId: codeId } }),
      prisma.branchDelivery.count({ where: { tenantId, statusCodeId: codeId } }),
      prisma.branchTransfer.count({ where: { tenantId, statusCodeId: codeId } }),
      prisma.branchPullout.count({
        where: {
          tenantId,
          OR: [{ statusCodeId: codeId }, { reasonStatusCodeId: codeId }],
        },
      }),
    ]).then(([a, b, c, d]) => a + b + c + d);
  },
};
