"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  announcementMediaPublicUrl,
  buildAnnouncementMediaPath,
} from "@/features/announcements/lib/announcement-media";
import { announcementService } from "@/features/announcements/services/announcement.service";
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from "@/features/announcements/schemas/announcement.schema";
import {
  hasPermission,
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from "@/lib/auth/permissions";
import { getObjectStorage } from "@/lib/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function revalidateAnnouncements() {
  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
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

export async function listAnnouncementFeedAction() {
  const session = await requireAuth();
  // #region agent log
  fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "f1e4c9",
    },
    body: JSON.stringify({
      sessionId: "f1e4c9",
      runId: "pre-fix",
      hypothesisId: "A",
      location: "announcement.actions.ts:listAnnouncementFeedAction",
      message: "listFeed start",
      data: { hasTenant: Boolean(session.user.tenantId) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  try {
    const rows = await announcementService.listFeedForUser(
      session.user.tenantId,
      session.user.id,
    );
    // #region agent log
    fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f1e4c9",
      },
      body: JSON.stringify({
        sessionId: "f1e4c9",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "announcement.actions.ts:listAnnouncementFeedAction:ok",
        message: "listFeed ok",
        data: { count: rows.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return rows;
  } catch (err) {
    const prismaCode =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    const meta =
      err && typeof err === "object" && "meta" in err
        ? (err as { meta: unknown }).meta
        : undefined;
    // #region agent log
    fetch("http://127.0.0.1:7904/ingest/90072bc3-ed3d-4cdb-89b5-6031621ce6d7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "f1e4c9",
      },
      body: JSON.stringify({
        sessionId: "f1e4c9",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "announcement.actions.ts:listAnnouncementFeedAction:err",
        message: "listFeed failed",
        data: {
          name: err instanceof Error ? err.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          prismaCode,
          meta,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }
}

export async function countUnreadAnnouncementsAction() {
  const session = await requireAuth();
  return announcementService.countUnreadForUser(
    session.user.tenantId,
    session.user.id,
  );
}

export async function listAnnouncementReadersAction(announcementId: string) {
  const session = await requireAuth();
  if (!announcementId) return [];
  return announcementService.listReaders(session.user.tenantId, announcementId);
}

export async function listAnnouncementCommentsAction(announcementId: string) {
  const session = await requireAuth();
  if (!announcementId) return [];
  return announcementService.listComments(
    session.user.tenantId,
    announcementId,
  );
}

export async function markAnnouncementReadAction(announcementId: string) {
  const session = await requireAuth();
  try {
    await announcementService.markRead({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      announcementId,
    });
    revalidateAnnouncements();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to mark as read",
    };
  }
}

export async function toggleAnnouncementLikeAction(announcementId: string) {
  const session = await requireAuth();
  try {
    const result = await announcementService.toggleLike({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      announcementId,
    });
    revalidateAnnouncements();
    return { success: true as const, ...result };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update like",
    };
  }
}

const commentSchema = z.object({
  announcementId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

const updateCommentSchema = z.object({
  commentId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

export async function addAnnouncementCommentAction(input: unknown) {
  const session = await requireAuth();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  }

  try {
    const comment = await announcementService.addComment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      announcementId: parsed.data.announcementId,
      body: parsed.data.body,
    });
    revalidateAnnouncements();
    return { success: true as const, comment };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to add comment",
    };
  }
}

export async function updateAnnouncementCommentAction(input: unknown) {
  const session = await requireAuth();
  const parsed = updateCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment" };
  }

  try {
    const comment = await announcementService.updateComment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      commentId: parsed.data.commentId,
      body: parsed.data.body,
    });
    revalidateAnnouncements();
    return { success: true as const, comment };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update comment",
    };
  }
}

export async function listAnnouncementCommentRevisionsAction(
  commentId: string,
) {
  const session = await requireAuth();
  if (!commentId) return [];
  return announcementService.listCommentRevisions(
    session.user.tenantId,
    commentId,
  );
}

export async function listAnnouncementRevisionsAction(announcementId: string) {
  const session = await requireAuth();
  if (!announcementId) return [];
  return announcementService.listRevisions(
    session.user.tenantId,
    announcementId,
  );
}

export async function deleteAnnouncementCommentAction(commentId: string) {
  const session = await requireAuth();
  if (!commentId) return { error: "Comment not found" };

  try {
    await announcementService.deleteComment({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      commentId,
      canManage: hasPermission(session.user.permissions, "announcements.manage"),
    });
    revalidateAnnouncements();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete comment",
    };
  }
}

export async function uploadAnnouncementImageAction(formData: FormData) {
  const session = await requirePermission("announcements.manage");
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose an image to upload" as const };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Image must be 5 MB or smaller" as const };
    }
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return { error: "Use a PNG, JPEG, GIF, or WebP image" as const };
    }

    const fileId = crypto.randomUUID();
    const storagePath = buildAnnouncementMediaPath({
      tenantId: session.user.tenantId,
      fileId,
      fileName: file.name || "image.png",
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    await getObjectStorage().upload({
      path: storagePath,
      body: buffer,
      contentType,
    });

    return {
      success: true as const,
      path: storagePath,
      url: announcementMediaPublicUrl(storagePath),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload image",
    };
  }
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
