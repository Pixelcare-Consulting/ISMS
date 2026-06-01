import { prisma } from "@/lib/database/client";

export const permissionRepository = {
  listWithStats() {
    return prisma.permission.findMany({
      orderBy: { slug: "asc" },
      include: {
        _count: { select: { rolePermissions: true } },
      },
    });
  },

  findById(id: string) {
    return prisma.permission.findUnique({
      where: { id },
      include: {
        _count: { select: { rolePermissions: true } },
      },
    });
  },

  findBySlug(slug: string) {
    return prisma.permission.findUnique({
      where: { slug },
    });
  },

  create(data: { slug: string; name: string; description?: string | null }) {
    return prisma.permission.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
      },
    });
  },

  update(
    id: string,
    data: {
      name: string;
      description?: string | null;
    },
  ) {
    return prisma.permission.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
      },
    });
  },

  delete(id: string) {
    return prisma.permission.delete({
      where: { id },
    });
  },
};
