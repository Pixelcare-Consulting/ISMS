import { auditService } from "@/features/audit/services/audit.service";
import { announcementRepository } from "@/features/announcements/repositories/announcement.repository";
import { sanitizeAnnouncementHtml } from "@/features/announcements/lib/sanitize-announcement-html";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas/announcement.schema";
import { notificationService } from "@/features/notifications/services/notification.service";

const ANNOUNCEMENT_NOTIFY_EXCERPT_MAX = 200;

function prepareAnnouncementBody(raw: string): string {
  const sanitized = sanitizeAnnouncementHtml(raw);
  const plain = sanitized.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!plain && !/<img\b/i.test(sanitized)) {
    throw new Error("Body is required");
  }
  return sanitized;
}

function stripAnnouncementHtmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function announcementPlainExcerpt(html: string, max = ANNOUNCEMENT_NOTIFY_EXCERPT_MAX): string {
  const plain = stripAnnouncementHtmlToPlain(html);
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

function isAnnouncementLive(row: {
  isActive: boolean;
  publishedAt: Date;
  expiresAt?: Date | null;
}): boolean {
  if (!row.isActive) return false;
  const now = Date.now();
  if (row.publishedAt.getTime() > now) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now) return false;
  return true;
}

async function notifyAnnouncementPublished(input: {
  tenantId: string;
  actorUserId: string;
  announcement: {
    id: string;
    title: string;
    body: string;
  };
}) {
  const body = announcementPlainExcerpt(input.announcement.body);
  await notificationService.createNotification({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    data: {
      audience: "TENANT",
      type: "announcement",
      title: input.announcement.title,
      body: body || null,
      href: "/dashboard",
      metadata: { announcementId: input.announcement.id },
    },
  });
}

export const announcementService = {
  listAnnouncements(tenantId: string) {
    return announcementRepository.listByTenant(tenantId);
  },

  listActiveForBanner(tenantId: string) {
    return announcementRepository.listActiveForBanner(tenantId);
  },

  listFeedForUser(tenantId: string, userId: string) {
    return announcementRepository.listFeedForUser(tenantId, userId);
  },

  countUnreadForUser(tenantId: string, userId: string) {
    return announcementRepository.countUnreadForUser(tenantId, userId);
  },

  listReaders(tenantId: string, announcementId: string) {
    return announcementRepository.listReaders(tenantId, announcementId);
  },

  listComments(tenantId: string, announcementId: string) {
    return announcementRepository.listComments(tenantId, announcementId);
  },

  async markRead(input: {
    tenantId: string;
    actorUserId: string;
    announcementId: string;
  }) {
    await announcementRepository.markRead(
      input.tenantId,
      input.announcementId,
      input.actorUserId,
    );
  },

  async toggleLike(input: {
    tenantId: string;
    actorUserId: string;
    announcementId: string;
  }) {
    return announcementRepository.toggleLike(
      input.tenantId,
      input.announcementId,
      input.actorUserId,
    );
  },

  async addComment(input: {
    tenantId: string;
    actorUserId: string;
    announcementId: string;
    body: string;
  }) {
    const body = input.body.trim();
    if (!body) throw new Error("Comment cannot be empty");
    if (body.length > 2000) throw new Error("Comment is too long");

    return announcementRepository.addComment(
      input.tenantId,
      input.announcementId,
      input.actorUserId,
      body,
    );
  },

  async updateComment(input: {
    tenantId: string;
    actorUserId: string;
    commentId: string;
    body: string;
  }) {
    const body = input.body.trim();
    if (!body) throw new Error("Comment cannot be empty");
    if (body.length > 2000) throw new Error("Comment is too long");

    const existing = await announcementRepository.findComment(
      input.tenantId,
      input.commentId,
    );
    if (!existing) throw new Error("Comment not found");
    if (existing.userId !== input.actorUserId) {
      throw new Error("You can only edit your own comments");
    }

    return announcementRepository.updateComment(
      input.tenantId,
      input.commentId,
      body,
      input.actorUserId,
    );
  },

  listCommentRevisions(tenantId: string, commentId: string) {
    return announcementRepository.listCommentRevisions(tenantId, commentId);
  },

  listRevisions(tenantId: string, announcementId: string) {
    return announcementRepository.listRevisions(tenantId, announcementId);
  },

  async deleteComment(input: {
    tenantId: string;
    actorUserId: string;
    commentId: string;
    canManage: boolean;
  }) {
    const existing = await announcementRepository.findComment(
      input.tenantId,
      input.commentId,
    );
    if (!existing) throw new Error("Comment not found");
    if (existing.userId !== input.actorUserId && !input.canManage) {
      throw new Error("You can only delete your own comments");
    }

    await announcementRepository.deleteComment(
      input.tenantId,
      input.commentId,
    );
  },

  async createAnnouncement(input: {
    tenantId: string;
    actorUserId: string;
    title: string;
    body: string;
    publishedAt: Date;
    expiresAt?: Date | null;
    isActive: boolean;
  }) {
    const parsed = createAnnouncementSchema.safeParse({
      ...input,
      body: prepareAnnouncementBody(input.body),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    if (
      parsed.data.expiresAt &&
      parsed.data.expiresAt.getTime() <= parsed.data.publishedAt.getTime()
    ) {
      throw new Error("Expiry must be after the publish date");
    }

    const announcement = await announcementRepository.create(input.tenantId, {
      ...parsed.data,
      createdById: input.actorUserId,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "announcement.created",
      entityType: "Announcement",
      entityId: announcement.id,
      metadata: { title: announcement.title },
    });

    if (isAnnouncementLive(announcement)) {
      await notifyAnnouncementPublished({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        announcement,
      });
    }

    return announcement;
  },

  async updateAnnouncement(input: {
    tenantId: string;
    actorUserId: string;
    announcementId: string;
    title: string;
    body: string;
    publishedAt: Date;
    expiresAt?: Date | null;
    isActive: boolean;
  }) {
    const parsed = updateAnnouncementSchema.safeParse({
      ...input,
      body: prepareAnnouncementBody(input.body),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    if (
      parsed.data.expiresAt &&
      parsed.data.expiresAt.getTime() <= parsed.data.publishedAt.getTime()
    ) {
      throw new Error("Expiry must be after the publish date");
    }

    const existing = await announcementRepository.findById(
      input.tenantId,
      parsed.data.announcementId,
    );
    if (!existing) {
      throw new Error("Announcement not found");
    }

    const wasLive = isAnnouncementLive(existing);

    const announcement = await announcementRepository.update(
      input.tenantId,
      parsed.data.announcementId,
      {
        title: parsed.data.title,
        body: parsed.data.body,
        publishedAt: parsed.data.publishedAt,
        expiresAt: parsed.data.expiresAt,
        isActive: parsed.data.isActive,
      },
      input.actorUserId,
    );

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "announcement.updated",
      entityType: "Announcement",
      entityId: announcement.id,
      metadata: { title: announcement.title },
    });

    // Notify once when a draft/scheduled/inactive post becomes live for the team.
    if (!wasLive && isAnnouncementLive(announcement)) {
      await notifyAnnouncementPublished({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        announcement,
      });
    }

    return announcement;
  },

  async deleteAnnouncement(input: {
    tenantId: string;
    actorUserId: string;
    announcementId: string;
  }) {
    const existing = await announcementRepository.findById(
      input.tenantId,
      input.announcementId,
    );
    if (!existing) {
      throw new Error("Announcement not found");
    }

    await announcementRepository.delete(input.tenantId, input.announcementId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "announcement.deleted",
      entityType: "Announcement",
      entityId: input.announcementId,
      metadata: { title: existing.title },
    });
  },
};
