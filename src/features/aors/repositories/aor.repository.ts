import { prisma } from "@/lib/database/client";

const aorListInclude = {
  user: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  branch: { select: { id: true, name: true, sapCode: true } },
  warehouse: { select: { id: true, name: true, code: true } },
} as const;

export const aorRepository = {
  listByTenant(tenantId: string) {
    return prisma.aor.findMany({
      where: { tenantId },
      include: aorListInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  create(
    tenantId: string,
    data: {
      userId: string;
      createdById?: string | null;
      branchId?: string | null;
      warehouseId?: string | null;
    },
  ) {
    return prisma.aor.create({
      data: {
        tenantId,
        userId: data.userId,
        createdById: data.createdById ?? null,
        branchId: data.branchId ?? null,
        warehouseId: data.warehouseId ?? null,
      },
      include: aorListInclude,
    });
  },

  async createMany(
    tenantId: string,
    rows: { userId: string; branchId: string; createdById?: string | null }[],
  ) {
    if (rows.length === 0) return [];

    const created = await prisma.aor.createManyAndReturn({
      data: rows.map((row) => ({
        tenantId,
        userId: row.userId,
        branchId: row.branchId,
        createdById: row.createdById ?? null,
      })),
      select: { id: true },
    });

    return prisma.aor.findMany({
      where: {
        tenantId,
        id: { in: created.map((row) => row.id) },
      },
      include: aorListInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  delete(tenantId: string, id: string) {
    return prisma.aor.deleteMany({ where: { id, tenantId } });
  },

  listBranchIdsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, branchId: { not: null } },
      select: { branchId: true },
    });
  },

  async listExistingBranchIds(tenantId: string, userId: string) {
    const rows = await this.listBranchIdsForUser(tenantId, userId);
    return rows
      .map((row) => row.branchId)
      .filter((id): id is string => id !== null);
  },

  listBranchIdsByDealerIds(tenantId: string, dealerIds: string[]) {
    if (dealerIds.length === 0) return Promise.resolve([] as { id: string }[]);
    return prisma.branch.findMany({
      where: {
        tenantId,
        dealerId: { in: dealerIds },
        deletedAt: null,
        status: "active",
      },
      select: { id: true },
    });
  },
};
