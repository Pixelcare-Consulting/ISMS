import { prisma } from "@/lib/database/client";

const announcementListInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

const feedUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  department: { select: { name: true } },
  userRoles: { select: { role: { select: { name: true, slug: true } } } },
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

  /** Published feed for Dashboard Overview (with engagement counts). */
  async listFeedForUser(tenantId: string, userId: string, limit = 40) {
    const now = new Date();
    const rows = await prisma.announcement.findMany({
      where: {
        tenantId,
        isActive: true,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: {
          select: { reads: true, likes: true, comments: true },
        },
        likes: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
        /** First 5 readers for avatar stack (newest first). */
        reads: {
          orderBy: { readAt: "desc" },
          take: 5,
          select: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });

    const myReads =
      rows.length === 0
        ? []
        : await prisma.announcementRead.findMany({
            where: {
              userId,
              announcementId: { in: rows.map((row) => row.id) },
            },
            select: { announcementId: true },
          });
    const readByMeIds = new Set(myReads.map((row) => row.announcementId));

    return rows.map((row) => {
      const commentsChronological = [...row.comments].reverse();
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        publishedAt: row.publishedAt,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        readCount: row._count.reads,
        likeCount: row._count.likes,
        commentCount: row._count.comments,
        likedByMe: row.likes.length > 0,
        readByMe: readByMeIds.has(row.id),
        readerPreviews: row.reads.map((read) => read.user),
        comments: commentsChronological.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          user: c.user,
        })),
      };
    });
  },

  listReaders(tenantId: string, announcementId: string) {
    return prisma.announcementRead.findMany({
      where: {
        announcementId,
        announcement: { tenantId },
      },
      orderBy: { readAt: "desc" },
      include: {
        user: { select: feedUserSelect },
      },
    });
  },

  /** Active published announcements the user has not marked as read. */
  countUnreadForUser(tenantId: string, userId: string) {
    const now = new Date();
    return prisma.announcement.count({
      where: {
        tenantId,
        isActive: true,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        reads: { none: { userId } },
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
    editedById?: string,
  ) {
    const existing = await this.findById(tenantId, id);
    if (!existing) {
      throw new Error("Announcement not found");
    }

    const contentChanged =
      existing.title !== data.title || existing.body !== data.body;

    if (contentChanged && editedById) {
      await prisma.$transaction(async (tx) => {
        await tx.announcementRevision.create({
          data: {
            announcementId: id,
            title: existing.title,
            body: existing.body,
            editedById,
          },
        });

        await tx.announcement.update({
          where: { id },
          data: {
            title: data.title,
            body: data.body,
            publishedAt: data.publishedAt,
            expiresAt: data.expiresAt ?? null,
            isActive: data.isActive,
          },
        });
      });
    } else {
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
    }

    const updated = await this.findById(tenantId, id);
    if (!updated) {
      throw new Error("Announcement not found");
    }
    return updated;
  },

  listRevisions(tenantId: string, announcementId: string) {
    return prisma.announcementRevision.findMany({
      where: {
        announcementId,
        announcement: { tenantId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        editedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  delete(tenantId: string, id: string) {
    return prisma.announcement.deleteMany({ where: { id, tenantId } });
  },

  async markRead(tenantId: string, announcementId: string, userId: string) {
    const exists = await prisma.announcement.findFirst({
      where: { id: announcementId, tenantId },
      select: { id: true },
    });
    if (!exists) throw new Error("Announcement not found");

    await prisma.announcementRead.upsert({
      where: {
        announcementId_userId: { announcementId, userId },
      },
      create: { announcementId, userId },
      update: { readAt: new Date() },
    });
  },

  async toggleLike(tenantId: string, announcementId: string, userId: string) {
    const exists = await prisma.announcement.findFirst({
      where: { id: announcementId, tenantId },
      select: { id: true },
    });
    if (!exists) throw new Error("Announcement not found");

    const existing = await prisma.announcementLike.findUnique({
      where: {
        announcementId_userId: { announcementId, userId },
      },
    });

    if (existing) {
      await prisma.announcementLike.delete({ where: { id: existing.id } });
      return { liked: false as const };
    }

    await prisma.announcementLike.create({
      data: { announcementId, userId },
    });
    return { liked: true as const };
  },

  async addComment(
    tenantId: string,
    announcementId: string,
    userId: string,
    body: string,
  ) {
    const exists = await prisma.announcement.findFirst({
      where: { id: announcementId, tenantId },
      select: { id: true },
    });
    if (!exists) throw new Error("Announcement not found");

    return prisma.announcementComment.create({
      data: { announcementId, userId, body },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  },

  listComments(tenantId: string, announcementId: string) {
    return prisma.announcementComment.findMany({
      where: {
        announcementId,
        announcement: { tenantId },
      },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  },

  findComment(tenantId: string, commentId: string) {
    return prisma.announcementComment.findFirst({
      where: {
        id: commentId,
        announcement: { tenantId },
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
  },

  async updateComment(
    tenantId: string,
    commentId: string,
    body: string,
    editedById: string,
  ) {
    const existing = await this.findComment(tenantId, commentId);
    if (!existing) throw new Error("Comment not found");

    if (existing.body === body) {
      return existing;
    }

    return prisma.$transaction(async (tx) => {
      await tx.announcementCommentRevision.create({
        data: {
          commentId,
          body: existing.body,
          editedById,
        },
      });

      return tx.announcementComment.update({
        where: { id: commentId },
        data: { body },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
    });
  },

  listCommentRevisions(tenantId: string, commentId: string) {
    return prisma.announcementCommentRevision.findMany({
      where: {
        commentId,
        comment: { announcement: { tenantId } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        createdAt: true,
        editedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  async deleteComment(tenantId: string, commentId: string) {
    const existing = await this.findComment(tenantId, commentId);
    if (!existing) throw new Error("Comment not found");

    await prisma.announcementComment.delete({ where: { id: commentId } });
    return existing;
  },
};
