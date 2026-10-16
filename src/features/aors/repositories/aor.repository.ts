import { Prisma } from "@/lib/database/generated/prisma/client";

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

type AorListRow = Prisma.AorGetPayload<{ include: typeof aorListInclude }>;

const ASSIGNMENT_CONFLICT_MESSAGE =
  "That assignment already exists. Refresh the page and try again.";

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function presentTargets(
  rows: {
    branchId: string | null;
    warehouseId: string | null;
    dealerId: string | null;
    serviceCenterId: string | null;
  }[],
) {
  return {
    branches: new Set(
      rows
        .map((row) => row.branchId)
        .filter((id): id is string => id !== null),
    ),
    warehouses: new Set(
      rows
        .map((row) => row.warehouseId)
        .filter((id): id is string => id !== null),
    ),
    dealers: new Set(
      rows
        .map((row) => row.dealerId)
        .filter((id): id is string => id !== null),
    ),
    serviceCenters: new Set(
      rows
        .map((row) => row.serviceCenterId)
        .filter((id): id is string => id !== null),
    ),
  };
}

function rowAlreadyAssigned(
  present: ReturnType<typeof presentTargets>,
  row: AorCreateRow,
) {
  if (row.branchId && present.branches.has(row.branchId)) return true;
  if (row.warehouseId && present.warehouses.has(row.warehouseId)) return true;
  if (row.dealerId && present.dealers.has(row.dealerId)) return true;
  if (row.serviceCenterId && present.serviceCenters.has(row.serviceCenterId)) {
    return true;
  }
  return false;
}

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

  /**
   * Apply an AOR diff in one transaction. Rows the user already has are left
   * in place so an edit does not insert a second assignment for the same
   * branch, warehouse, dealer, or service center.
   */
  async applySync(
    tenantId: string,
    userId: string,
    idsToDelete: string[],
    rowsToCreate: AorCreateRow[],
  ): Promise<{ created: AorListRow[]; deletedCount: number }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const deleted =
          idsToDelete.length === 0
            ? { count: 0 }
            : await tx.aor.deleteMany({
                where: { tenantId, id: { in: idsToDelete } },
              });

        const existing = await tx.aor.findMany({
          where: { tenantId, userId },
          select: {
            branchId: true,
            warehouseId: true,
            dealerId: true,
            serviceCenterId: true,
          },
        });
        const present = presentTargets(existing);
        const pending = rowsToCreate.filter(
          (row) => !rowAlreadyAssigned(present, row),
        );

        if (pending.length === 0) {
          return { created: [], deletedCount: deleted.count };
        }

        const created = await tx.aor.createManyAndReturn({
          data: pending.map((row) => ({
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

        const createdRows = await tx.aor.findMany({
          where: {
            tenantId,
            id: { in: created.map((row) => row.id) },
          },
          include: aorListInclude,
          orderBy: { createdAt: "desc" },
        });

        return { created: createdRows, deletedCount: deleted.count };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new Error(ASSIGNMENT_CONFLICT_MESSAGE);
      }
      throw error;
    }
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
