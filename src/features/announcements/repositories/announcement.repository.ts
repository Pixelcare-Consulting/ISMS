import { prisma } from "@/lib/database/client";

const announcementListInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export type AnnouncementListItem = Awaited<
  ReturnType<typeof announcementRepository.listByTenant>
>[number];

export const announcementRepository = {
  listByTenant(tenantId: string) {
    return prisma.announcement.findMany({
      where: { tenantId },
      include: announcementListInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.announcement.findFirst({
      where: { id, tenantId },
      include: announcementListInclude,
    });
  },

  listActiveForBanner(tenantId: string, limit = 3) {
    const now = new Date();
    return prisma.announcement.findMany({
      where: {
        tenantId,
        isActive: true,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        expiresAt: true,
      },
    });
  },

  create(
    tenantId: string,
    data: {
      title: string;
      body: string;
      publishedAt: Date;
      expiresAt?: Date | null;
      isActive: boolean;
      createdById: string;
    },
  ) {
    return prisma.announcement.create({
      data: {
        tenantId,
        title: data.title,
        body: data.body,
        publishedAt: data.publishedAt,
        expiresAt: data.expiresAt ?? null,
        isActive: data.isActive,
        createdById: data.createdById,
      },
      include: announcementListInclude,
    });
  },

  async update(
    tenantId: string,
    id: string,
    data: {
      title: string;
      body: string;
      publishedAt: Date;
      expiresAt?: Date | null;
      isActive: boolean;
    },
  ) {
    const result = await prisma.announcement.updateMany({
      where: { id, tenantId },
      data: {
        title: data.title,
        body: data.body,
        publishedAt: data.publishedAt,
        expiresAt: data.expiresAt ?? null,
        isActive: data.isActive,
      },
    });
    if (result.count === 0) {
      throw new Error("Announcement not found");
    }
    const updated = await this.findById(tenantId, id);
    if (!updated) {
      throw new Error("Announcement not found");
    }
    return updated;
  },

  delete(tenantId: string, id: string) {
    return prisma.announcement.deleteMany({ where: { id, tenantId } });
  },
};
