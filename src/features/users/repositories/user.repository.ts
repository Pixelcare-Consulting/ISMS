import { prisma } from "@/lib/database/client";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export const userRepository = {
  /**
   * Includes soft-deleted rows. `users_tenant_id_email_key` is on
   * (tenantId, email) with no deletedAt filter, so a deleted person still
   * occupies the address. A live row is preferred when casing differs.
   */
  findByEmail(tenantId: string, email: string) {
    const normalized = normalizeEmail(email);
    return prisma.user.findFirst({
      where: {
        tenantId,
        email: { equals: normalized, mode: "insensitive" },
      },
      orderBy: { deletedAt: { sort: "asc", nulls: "first" } },
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
    mustChangePassword?: boolean;
  }) {
    return prisma.user.create({
      data: {
        tenantId: data.tenantId,
        email: normalizeEmail(data.email),
        name: data.name,
        passwordHash: data.passwordHash,
        departmentId: data.departmentId ?? null,
        mustChangePassword: data.mustChangePassword ?? false,
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

  clearMustChangePassword(tenantId: string, id: string) {
    return prisma.user.update({
      where: { id, tenantId },
      data: { mustChangePassword: false },
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

  /** Puts a soft-deleted person back. Same shape as tenant restore: clear deletedAt on the existing row. */
  restore(
    tenantId: string,
    id: string,
    data: {
      email: string;
      name: string;
      passwordHash: string;
      departmentId?: string | null;
    },
  ) {
    return prisma.user.update({
      where: { id, tenantId },
      data: {
        email: normalizeEmail(data.email),
        name: data.name,
        passwordHash: data.passwordHash,
        departmentId: data.departmentId ?? null,
        deletedAt: null,
        disabledAt: null,
        mustChangePassword: false,
      },
    });
  },

  setDisabledAt(tenantId: string, id: string, disabledAt: Date | null) {
    return prisma.user.update({
      where: { id, tenantId },
      data: { disabledAt },
    });
  },

  /** Removes every login session row so the user is signed out everywhere. */
  async deleteSessions(userId: string) {
    const { count } = await prisma.session.deleteMany({ where: { userId } });
    return count;
  },
};
