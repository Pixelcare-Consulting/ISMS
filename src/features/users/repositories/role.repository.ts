import { prisma } from "@/lib/database/client";

export const roleRepository = {
  findBySlug(tenantId: string, slug: string) {
    return prisma.role.findFirst({
      where: { tenantId, slug, deletedAt: null },
    });
  },

  findById(tenantId: string, roleId: string) {
    return prisma.role.findFirst({
      where: { id: roleId, tenantId, deletedAt: null },
    });
  },

  listPermissions() {
    return prisma.permission.findMany({
      orderBy: { slug: "asc" },
    });
  },

  findPermissionBySlug(slug: string) {
    return prisma.permission.findUnique({
      where: { slug },
    });
  },

  grantPermission(roleId: string, permissionId: string) {
    return prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId },
      },
      create: { roleId, permissionId },
      update: {},
    });
  },

  revokePermission(roleId: string, permissionId: string) {
    return prisma.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
  },

  listByTenant(tenantId: string) {
    return prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  countUsers(roleId: string) {
    return prisma.userRole.count({
      where: { roleId },
    });
  },

  create(data: {
    tenantId: string;
    slug: string;
    name: string;
    description?: string | null;
    isSystem?: boolean;
  }) {
    return prisma.role.create({
      data: {
        tenantId: data.tenantId,
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        isSystem: data.isSystem ?? false,
      },
    });
  },

  update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      description?: string | null;
    },
  ) {
    return prisma.role.update({
      where: { id, tenantId },
      data,
    });
  },

  softDelete(tenantId: string, id: string) {
    return prisma.role.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  },
};
