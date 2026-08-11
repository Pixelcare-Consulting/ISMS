import { prisma } from "@/lib/database/client";

const customerWhere = {
  isPlatform: false,
} as const;

export const tenantRepository = {
  findBySlug(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  },

  findBySlugAny(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug },
    });
  },

  findById(id: string) {
    return prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
  },

  findByIdIncludingDisabled(id: string) {
    return prisma.tenant.findFirst({
      where: { id },
    });
  },

  create(data: {
    name: string;
    slug: string;
    tagline?: string | null;
    isPlatform?: boolean;
  }) {
    return prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        tagline: data.tagline,
        isPlatform: data.isPlatform ?? false,
      },
    });
  },

  updateBranding(
    tenantId: string,
    data: { name: string; tagline: string | null; logo?: string | null },
  ) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name,
        tagline: data.tagline,
        ...(data.logo !== undefined ? { logo: data.logo } : {}),
      },
    });
  },

  listCustomers() {
    return prisma.tenant.findMany({
      where: customerWhere,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
          },
        },
      },
    });
  },

  softDelete(id: string) {
    return prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  restore(id: string) {
    return prisma.tenant.update({
      where: { id },
      data: { deletedAt: null },
    });
  },

  async getSummaryCounts() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [activeCustomers, disabledCustomers, totalUsers, createdThisMonth] =
      await Promise.all([
        prisma.tenant.count({
          where: { ...customerWhere, deletedAt: null },
        }),
        prisma.tenant.count({
          where: { ...customerWhere, deletedAt: { not: null } },
        }),
        prisma.user.count({
          where: {
            deletedAt: null,
            tenant: { ...customerWhere },
          },
        }),
        prisma.tenant.count({
          where: {
            ...customerWhere,
            createdAt: { gte: startOfMonth },
          },
        }),
      ]);

    return {
      activeCustomers,
      disabledCustomers,
      totalUsers,
      createdThisMonth,
    };
  },
};
