"use server";

import { revalidatePath } from "next/cache";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  decideDefectSchema,
  reportDefectSchema,
} from "@/features/inventory/schemas/defect.schema";
import { defectService } from "@/features/inventory/services/defect.service";
import { requirePermission } from "@/lib/auth/permissions";
import {
  buildDefectReportPhotoPath,
  getObjectStorage,
} from "@/lib/storage";

function revalidateInventoryPaths() {
  revalidatePath("/inventory");
  revalidatePath("/inventory/serial-numbers");
}

export async function uploadDefectReportPhotoAction(formData: FormData) {
  const session = await requirePermission("inventory.view");
  try {
    const reportId = formData.get("reportId");
    if (typeof reportId !== "string" || !reportId) {
      return { error: "Missing report reference" as const };
    }

    const files = formData
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return { error: "No file selected" as const };
    }

    const storage = await getObjectStorage();
    const uploaded: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const storagePath = buildDefectReportPhotoPath({
        tenantId: session.user.tenantId,
        reportId,
        fileId,
        fileName: file.name,
      });
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.upload({
        path: storagePath,
        body: buffer,
        contentType: file.type || "application/octet-stream",
      });
      uploaded.push({
        storagePath,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
    }

    return { success: true as const, photos: uploaded };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload photo",
    };
  }
}

export async function reportInventoryDefectAction(input: unknown) {
  const session = await requirePermission("inventory.view");
  const parsed = reportDefectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const report = await defectService.reportDefect({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissions: session.user.permissions,
      branchInventoryId: parsed.data.branchInventoryId,
      reason: parsed.data.reason,
      remarks: parsed.data.remarks,
      photos: parsed.data.photoPaths,
    });
    revalidateInventoryPaths();
    return { success: true as const, reportId: report.id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to report defect",
    };
  }
}

export async function approveInventoryDefectAction(input: unknown) {
  const session = await requirePermission("inventory.manage");
  const parsed = decideDefectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await defectService.approveDefect({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissions: session.user.permissions,
      reportId: parsed.data.reportId,
      decisionRemarks: parsed.data.decisionRemarks,
    });
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to approve defect",
    };
  }
}

export async function rejectInventoryDefectAction(input: unknown) {
  const session = await requirePermission("inventory.manage");
  const parsed = decideDefectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await defectService.rejectDefect({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      permissions: session.user.permissions,
      reportId: parsed.data.reportId,
      decisionRemarks: parsed.data.decisionRemarks,
    });
    revalidateInventoryPaths();
    return { success: true as const };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to reject defect",
    };
  }
}

export async function listPendingInventoryDefectsAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requirePermission("inventory.manage");
  const limit = parseTablePageSize(input?.limit);
  const result = await defectService.listPendingForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
    { page: input?.page, limit },
  );

  return {
    items: result.items.map((row) => ({
      id: row.id,
      reason: row.reason,
      remarks: row.remarks,
      reportedAt: row.reportedAt.toISOString(),
      branch: row.branch,
      serialNumber: {
        id: row.serialNumber.id,
        serialNo: row.serialNumber.serialNo,
        model: row.serialNumber.model,
      },
      reporter: row.reporter,
      photos: row.photos,
      branchInventoryId: row.branchInventoryId,
    })),
    total: result.total,
    page: input?.page ?? 1,
    limit,
  };
}

export async function getOpenDefectReportForInventoryAction(
  branchInventoryId: string,
) {
  const session = await requirePermission("inventory.view");
  if (!branchInventoryId) {
    return { report: null as null };
  }
  const report = await defectService.getOpenPendingForInventory(
    session.user.tenantId,
    branchInventoryId,
  );
  if (!report) {
    return { report: null as null };
  }
  return {
    report: {
      id: report.id,
      status: report.status,
      reason: report.reason,
      reportedAt: report.reportedAt.toISOString(),
    },
  };
}

/** Pre-upload helper: managers with view can stage photos before report id exists. */
export async function uploadDefectReportPhotoDraftAction(formData: FormData) {
  const session = await requirePermission("inventory.view");
  try {
    const draftId = formData.get("draftId");
    const draftKey =
      typeof draftId === "string" && draftId ? draftId : crypto.randomUUID();

    const files = formData
      .getAll("photos")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      return { error: "No file selected" as const };
    }

    const storage = await getObjectStorage();
    const uploaded: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const storagePath = buildDefectReportPhotoPath({
        tenantId: session.user.tenantId,
        reportId: `draft-${draftKey}`,
        fileId,
        fileName: file.name,
      });
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.upload({
        path: storagePath,
        body: buffer,
        contentType: file.type || "application/octet-stream",
      });
      uploaded.push({
        storagePath,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
    }

    return { success: true as const, draftId: draftKey, photos: uploaded };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload photo",
    };
  }
}
