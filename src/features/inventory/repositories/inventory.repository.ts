import { prisma } from "@/lib/database/client";

export const inventoryRepository = {
  listByBranches(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchInventory.findMany({
      where: { tenantId, branchId: { in: branchIds } },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        statusCode: { select: { id: true, code: true, name: true } },
        serialNumber: {
          include: {
            model: {
              select: {
                id: true,
                skuCode: true,
                name: true,
                brand: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  },

  countByStatus(tenantId: string, branchIds: string[]) {
    if (branchIds.length === 0) return Promise.resolve([]);
    return prisma.branchInventory.groupBy({
      by: ["statusCodeId"],
      where: { tenantId, branchId: { in: branchIds } },
      _count: { id: true },
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    statusCodeId: string,
    updatedById: string,
  ) {
    return prisma.branchInventory.update({
      where: { id, tenantId },
      data: { statusCodeId, updatedById },
    });
  },

  countByStatusCode(tenantId: string, branchIds: string[], statusCodeId: string) {
    if (branchIds.length === 0) return Promise.resolve(0);
    return prisma.branchInventory.count({
      where: { tenantId, branchId: { in: branchIds }, statusCodeId },
    });
  },
};
