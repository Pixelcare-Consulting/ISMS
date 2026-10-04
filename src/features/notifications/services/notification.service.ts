import type { Prisma } from "@prisma/client";

import {
  notificationRepository,
  type InboxViewer,
} from "@/features/notifications/repositories/notification.repository";
import {
  createNotificationSchema,
  type CreateNotificationInput,
} from "@/features/notifications/schemas/notification.schema";

export const notificationService = {
  listForUser(input: InboxViewer & { limit?: number; offset?: number }) {
    return notificationRepository.listVisibleForUser(input);
  },

  countUnreadForUser(input: InboxViewer) {
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
      permissionKey: parsed.permissionKey,
      type: parsed.type,
      title: parsed.title,
      body: parsed.body,
      href: parsed.href,
      metadata: (parsed.metadata ?? null) as Prisma.InputJsonValue | null,
      createdById: input.actorUserId ?? null,
      expiresAt: parsed.expiresAt ?? null,
    });
  },

  async markRead(input: InboxViewer & { notificationId: string }) {
    const visible = await notificationRepository.findVisibleById(input);
    if (!visible) {
      throw new Error("Notification not found");
    }

    await notificationRepository.markRead({
      notificationId: input.notificationId,
      userId: input.userId,
    });
  },

  markAllRead(input: InboxViewer) {
    return notificationRepository.markAllRead(input);
  },
};
