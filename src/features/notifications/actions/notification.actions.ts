"use server";

import { revalidatePath } from "next/cache";

import { notificationService } from "@/features/notifications/services/notification.service";
import {
  listMyNotificationsSchema,
  markNotificationReadSchema,
} from "@/features/notifications/schemas/notification.schema";
import { requireAuth } from "@/lib/auth/permissions";

function revalidateNotifications() {
  revalidatePath("/", "layout");
}

function sessionInboxContext(session: Awaited<ReturnType<typeof requireAuth>>) {
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    roleSlugs: session.user.roleSlugs ?? [],
    permissions: session.user.permissions ?? [],
  };
}

export async function listMyNotificationsAction(input?: unknown) {
  const session = await requireAuth();
  const parsed = listMyNotificationsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { items: [], total: 0 };
  }

  return notificationService.listForUser({
    ...sessionInboxContext(session),
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });
}

export async function countUnreadNotificationsAction() {
  const session = await requireAuth();
  return notificationService.countUnreadForUser(sessionInboxContext(session));
}

export async function markNotificationReadAction(input: unknown) {
  const session = await requireAuth();
  const parsed = markNotificationReadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid notification",
    };
  }

  try {
    await notificationService.markRead({
      ...sessionInboxContext(session),
      notificationId: parsed.data.notificationId,
    });
    revalidateNotifications();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to mark as read",
    };
  }
}

export async function markAllNotificationsReadAction() {
  const session = await requireAuth();

  try {
    const result = await notificationService.markAllRead(
      sessionInboxContext(session),
    );
    revalidateNotifications();
    return { success: true as const, count: result.count };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to mark all as read",
    };
  }
}
