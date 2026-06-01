import { prisma } from "@/lib/database/client";

export const aorRepository = {
  listByTenant(tenantId: string) {
    return prisma.aor.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true, sapCode: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  create(
    tenantId: string,
    data: { userId: string; branchId?: string | null; warehouseId?: string | null },
  ) {
    return prisma.aor.create({
      data: {
        tenantId,
        userId: data.userId,
        branchId: data.branchId ?? null,
        warehouseId: data.warehouseId ?? null,
      },
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
};
