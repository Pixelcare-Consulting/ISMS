import { prisma } from "@/lib/database/client";

export const tenantRepository = {
  findBySlug(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  },

  findById(id: string) {
    return prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
  },

  create(data: { name: string; slug: string; tagline?: string | null }) {
    return prisma.tenant.create({ data });
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
};
