import { prisma } from "@/lib/database/client";

const aorListInclude = {
  user: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  branch: { select: { id: true, name: true, sapCode: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  dealer: { select: { id: true, name: true, sapCode: true } },
  serviceCenter: { select: { id: true, name: true, sapCode: true } },
  serviceCenterLocation: { select: { id: true, name: true, code: true } },
} as const;

type AorCreateRow = {
  userId: string;
  createdById?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  dealerId?: string | null;
  serviceCenterId?: string | null;
  serviceCenterLocationId?: string | null;
};

export const aorRepository = {
  listByTenant(tenantId: string) {
    return prisma.aor.findMany({
      where: { tenantId },
      include: aorListInclude,
      orderBy: { createdAt: "desc" },
    });
  },

  listByUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId },
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
      dealerId?: string | null;
      serviceCenterId?: string | null;
      serviceCenterLocationId?: string | null;
    },
  ) {
    return prisma.aor.create({
      data: {
        tenantId,
        userId: data.userId,
        createdById: data.createdById ?? null,
        branchId: data.branchId ?? null,
        warehouseId: data.warehouseId ?? null,
        dealerId: data.dealerId ?? null,
        serviceCenterId: data.serviceCenterId ?? null,
        serviceCenterLocationId: data.serviceCenterLocationId ?? null,
      },
      include: aorListInclude,
    });
  },

  async createMany(tenantId: string, rows: AorCreateRow[]) {
    if (rows.length === 0) return [];

    const created = await prisma.aor.createManyAndReturn({
      data: rows.map((row) => ({
        tenantId,
        userId: row.userId,
        branchId: row.branchId ?? null,
        warehouseId: row.warehouseId ?? null,
        dealerId: row.dealerId ?? null,
        serviceCenterId: row.serviceCenterId ?? null,
        serviceCenterLocationId: row.serviceCenterLocationId ?? null,
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

  deleteMany(tenantId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return prisma.aor.deleteMany({ where: { tenantId, id: { in: ids } } });
  },

  listBranchIdsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, branchId: { not: null } },
      select: { branchId: true },
    });
  },

  listWarehouseIdsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, warehouseId: { not: null } },
      select: { id: true, warehouseId: true },
    });
  },

  listDealerIdsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, dealerId: { not: null } },
      select: { id: true, dealerId: true },
    });
  },

  listServiceCenterAorsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, serviceCenterId: { not: null } },
      select: { id: true, serviceCenterId: true, serviceCenterLocationId: true },
    });
  },

  listBranchAorsForUser(tenantId: string, userId: string) {
    return prisma.aor.findMany({
      where: { tenantId, userId, branchId: { not: null } },
      select: { id: true, branchId: true },
    });
  },

  async listExistingBranchIds(tenantId: string, userId: string) {
    const rows = await this.listBranchIdsForUser(tenantId, userId);
    return rows
      .map((row) => row.branchId)
      .filter((id): id is string => id !== null);
  },

  async listExistingWarehouseIds(tenantId: string, userId: string) {
    const rows = await this.listWarehouseIdsForUser(tenantId, userId);
    return rows
      .map((row) => row.warehouseId)
      .filter((id): id is string => id !== null);
  },

  async listExistingDealerIds(tenantId: string, userId: string) {
    const rows = await this.listDealerIdsForUser(tenantId, userId);
    return rows
      .map((row) => row.dealerId)
      .filter((id): id is string => id !== null);
  },

  async listExistingServiceCenterIds(tenantId: string, userId: string) {
    const rows = await this.listServiceCenterAorsForUser(tenantId, userId);
    return [
      ...new Set(
        rows
          .map((row) => row.serviceCenterId)
          .filter((id): id is string => id !== null),
      ),
    ];
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
