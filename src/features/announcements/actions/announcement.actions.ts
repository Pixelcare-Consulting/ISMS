"use server";

import { revalidatePath } from "next/cache";

import { announcementService } from "@/features/announcements/services/announcement.service";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas/announcement.schema";
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from "@/lib/auth/permissions";

function revalidateAnnouncements() {
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
}

export async function listAnnouncementsAction() {
  const session = await requireAnyPermission([
    "announcements.view",
    "announcements.manage",
  ]);
  return announcementService.listAnnouncements(session.user.tenantId);
}

export async function listActiveAnnouncementsAction() {
  const session = await requireAuth();
  return announcementService.listActiveForBanner(session.user.tenantId);
}

export async function createAnnouncementAction(input: unknown) {
  const session = await requirePermission("announcements.manage");
  const parsed = createAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const announcement = await announcementService.createAnnouncement({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidateAnnouncements();
    return { success: true as const, announcement };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create announcement",
    };
  }
}

export async function updateAnnouncementAction(input: unknown) {
  const session = await requirePermission("announcements.manage");
  const parsed = updateAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const announcement = await announcementService.updateAnnouncement({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidateAnnouncements();
    return { success: true as const, announcement };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update announcement",
    };
  }
}

export async function deleteAnnouncementAction(announcementId: string) {
  const session = await requirePermission("announcements.manage");
  try {
    await announcementService.deleteAnnouncement({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      announcementId,
    });
    revalidateAnnouncements();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete announcement",
    };
  }
}
