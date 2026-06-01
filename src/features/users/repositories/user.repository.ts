import { prisma } from "@/lib/database/client";

export const userRepository = {
  findByEmail(tenantId: string, email: string) {
    return prisma.user.findFirst({
      where: { tenantId, email: email.toLowerCase(), deletedAt: null },
    });
  },

  listByTenant(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        department: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
        department: true,
      },
    });
  },

  create(data: {
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
    departmentId?: string | null;
  }) {
    return prisma.user.create({
      data: {
        tenantId: data.tenantId,
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        departmentId: data.departmentId ?? null,
      },
    });
  },

  updateProfile(
    tenantId: string,
    id: string,
    data: { name?: string; image?: string | null; departmentId?: string | null },
  ) {
    return prisma.user.update({
      where: { id, tenantId },
      data,
    });
  },

  updatePasswordHash(tenantId: string, id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id, tenantId },
      data: { passwordHash },
    });
  },

  assignRole(userId: string, roleId: string) {
    return prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  },

  setRoles(userId: string, roleIds: string[]) {
    return prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
        });
      }
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      departmentId?: string | null;
    },
  ) {
    return prisma.user.update({
      where: { id, tenantId },
      data,
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.user.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },
};
