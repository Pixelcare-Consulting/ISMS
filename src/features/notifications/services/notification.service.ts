import type { Prisma } from "@prisma/client";

import { notificationRepository } from "@/features/notifications/repositories/notification.repository";
import {
  createNotificationSchema,
  type CreateNotificationInput,
} from "@/features/notifications/schemas/notification.schema";

export const notificationService = {
  listForUser(input: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
    limit?: number;
    offset?: number;
  }) {
    return notificationRepository.listVisibleForUser(input);
  },

  countUnreadForUser(input: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
  }) {
    return notificationRepository.countUnreadForUser(input);
  },

  async createNotification(input: {
    tenantId: string;
    actorUserId?: string | null;
    data: CreateNotificationInput;
  }) {
    const parsed = createNotificationSchema.parse(input.data);

    return notificationRepository.create({
      tenantId: input.tenantId,
      audience: parsed.audience,
      roleSlug: parsed.roleSlug,
      userId: parsed.userId,
      type: parsed.type,
      title: parsed.title,
      body: parsed.body,
      href: parsed.href,
      metadata: (parsed.metadata ?? null) as Prisma.InputJsonValue | null,
      createdById: input.actorUserId ?? null,
      expiresAt: parsed.expiresAt ?? null,
    });
  },

  async markRead(input: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
    notificationId: string;
  }) {
    const visible = await notificationRepository.findVisibleById({
      tenantId: input.tenantId,
      userId: input.userId,
      roleSlugs: input.roleSlugs,
      notificationId: input.notificationId,
    });
    if (!visible) {
      throw new Error("Notification not found");
    }

    await notificationRepository.markRead({
      notificationId: input.notificationId,
      userId: input.userId,
    });
  },

  markAllRead(input: {
    tenantId: string;
    userId: string;
    roleSlugs: string[];
  }) {
    return notificationRepository.markAllRead(input);
  },
};
