import { prisma } from "@/lib/database/client";

export const departmentRepository = {
  listByTenant(tenantId: string) {
    return prisma.department.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.department.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  },

  create(tenantId: string, data: { name: string }) {
    return prisma.department.create({
      data: { tenantId, name: data.name },
    });
  },

  update(tenantId: string, id: string, data: { name: string }) {
    return prisma.department.update({
      where: { id, tenantId },
      data: { name: data.name },
    });
  },

  countUsers(tenantId: string, departmentId: string) {
    return prisma.user.count({
      where: { tenantId, departmentId, deletedAt: null },
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.department.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },

  createMany(tenantId: string, names: readonly string[]) {
    return prisma.department.createMany({
      data: names.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
    });
  },
};
