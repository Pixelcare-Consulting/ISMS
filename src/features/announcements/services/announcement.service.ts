import { auditService } from "@/features/audit/services/audit.service";
import { announcementRepository } from "@/features/announcements/repositories/announcement.repository";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas/announcement.schema";

export const announcementService = {
  listAnnouncements(tenantId: string) {
    return announcementRepository.listByTenant(tenantId);
  },

  listActiveForBanner(tenantId: string) {
    return announcementRepository.listActiveForBanner(tenantId);
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
    const parsed = createAnnouncementSchema.safeParse(input);
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
    const parsed = updateAnnouncementSchema.safeParse(input);
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
    );

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "announcement.updated",
      entityType: "Announcement",
      entityId: announcement.id,
      metadata: { title: announcement.title },
    });

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
