import type { LookupRecordStatus, ReasonStatusCategory } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";

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
          select: { id: true, name: true, code: true },
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

  createCode(input: {
    tenantId: string;
    reasonStatusId: string;
    name: string;
    code: string;
    sortOrder?: number;
  }) {
    return prisma.reasonStatusCode.create({
      data: {
        tenantId: input.tenantId,
        reasonStatusId: input.reasonStatusId,
        name: input.name,
        code: input.code.toUpperCase(),
        sortOrder: input.sortOrder ?? 0,
        isSystem: false,
      },
    });
  },

  updateCode(
    tenantId: string,
    id: string,
    data: { name?: string; recordStatus?: LookupRecordStatus; sortOrder?: number },
  ) {
    return prisma.reasonStatusCode.update({
      where: { id, tenantId },
      data,
    });
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
