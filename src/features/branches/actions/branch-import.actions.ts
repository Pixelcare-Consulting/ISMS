"use server";

import { revalidatePath } from "next/cache";

import { branchImportService } from "@/features/branches/services/branch-import.service";
import type {
  BranchImportPreview,
  BranchImportResult,
} from "@/features/branches/schemas/branch-import.schema";
import { requirePermission } from "@/lib/auth/permissions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function readUpload(formData: FormData): Promise<Buffer> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an .xlsx or .csv file to upload.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("The file is larger than 5 MB.");
  }
  return Buffer.from(await file.arrayBuffer());
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Returns the workbook base64-encoded — server action results must be serializable. */
export async function downloadBranchImportTemplateAction(): Promise<string> {
  const session = await requirePermission("branches.manage");
  const workbook = await branchImportService.buildTemplate(session.user.tenantId);
  return workbook.toString("base64");
}

/** Validates and diffs the upload without writing anything. */
export async function previewBranchImportAction(
  formData: FormData,
): Promise<{ preview: BranchImportPreview } | { error: string }> {
  const session = await requirePermission("branches.manage");
  try {
    const file = await readUpload(formData);
    const { preview } = await branchImportService.buildPlan(session.user.tenantId, file);
    return { preview };
  } catch (error) {
    return { error: toMessage(error, "Could not read the file.") };
  }
}

/**
 * Re-parses the same file server-side and applies it, so the plan the browser saw
 * is never trusted as the source of the writes.
 */
export async function applyBranchImportAction(
  formData: FormData,
): Promise<{ success: true; result: BranchImportResult } | { error: string }> {
  const session = await requirePermission("branches.manage");
  try {
    const file = await readUpload(formData);
    const result = await branchImportService.apply({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      file,
    });
    revalidatePath("/settings/branches");
    return { success: true as const, result };
  } catch (error) {
    return { error: toMessage(error, "Import failed.") };
  }
}
