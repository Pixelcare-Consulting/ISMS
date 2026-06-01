import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";

export interface CreateAuditLogInput {
  tenantId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ListAuditLogsInput {
  tenantId: string;
  limit?: number;
  page?: number;
  action?: string;
  entityType?: string;
  userId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

function parseDateBoundary(value: string, boundary: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (boundary === "start") {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export const auditLogRepository = {
  async create(input: CreateAuditLogInput) {
    return prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  },

  async listByTenant(tenantId: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async listForTenant(input: ListAuditLogsInput) {
    const limit = input.limit ?? 25;
    const page = Math.max(1, input.page ?? 1);
    const skip = (page - 1) * limit;

    const search = input.search?.trim();
    const createdAtFilter =
      input.dateFrom || input.dateTo
        ? {
            ...(input.dateFrom
              ? { gte: parseDateBoundary(input.dateFrom, "start") }
              : {}),
            ...(input.dateTo
              ? { lte: parseDateBoundary(input.dateTo, "end") }
              : {}),
          }
        : undefined;

    const where: Prisma.AuditLogWhereInput = {
      tenantId: input.tenantId,
      ...(input.action ? { action: input.action } : {}),
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { entityType: { contains: search, mode: "insensitive" } },
              {
                user: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async listDistinctActions(tenantId: string) {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    });
    return rows.map((row) => row.action);
  },

  async listDistinctEntityTypes(tenantId: string) {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    });
    return rows.map((row) => row.entityType);
  },

  findOlderThan(tenantId: string, before: Date, limit: number) {
    return prisma.auditLog.findMany({
      where: { tenantId, createdAt: { lt: before } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  },

  deleteByIds(tenantId: string, ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    return prisma.auditLog.deleteMany({
      where: { tenantId, id: { in: ids } },
    });
  },
};
