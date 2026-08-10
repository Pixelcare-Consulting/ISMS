"use server";

import { revalidatePath } from "next/cache";

import type {
  ModelImportChunkProgress,
  ModelImportPreview,
  ModelImportResult,
} from "@/features/master-data/schemas/model-import.schema";
import { modelImportService } from "@/features/master-data/services/model-import.service";
import { requirePermission } from "@/lib/auth/permissions";
import { cacheKey, deleteCache } from "@/lib/cache/redis";

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

function parseOffset(raw: FormDataEntryValue | null): number {
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid import offset.");
  }
  return value;
}

function invalidateModelsCache(tenantId: string) {
  return deleteCache(cacheKey("tenant", tenantId, "master-data", "models", "all"));
}

/** Returns the workbook base64-encoded — server action results must be serializable. */
export async function downloadModelImportTemplateAction(): Promise<string> {
  const session = await requirePermission("master_data.manage");
  const workbook = await modelImportService.buildTemplate(session.user.tenantId);
  return workbook.toString("base64");
}

/** Validates and diffs the upload without writing anything. */
export async function previewModelImportAction(
  formData: FormData,
): Promise<{ preview: ModelImportPreview } | { error: string }> {
  const session = await requirePermission("master_data.manage");
  try {
    const file = await readUpload(formData);
    const { preview } = await modelImportService.buildPlan(session.user.tenantId, file);
    return { preview };
  } catch (error) {
    return { error: toMessage(error, "Could not read the file.") };
  }
}

/**
 * Re-parses the same file server-side and applies one offset chunk.
 * Cache invalidation and revalidate run only on the final chunk.
 */
export async function applyModelImportChunkAction(
  formData: FormData,
): Promise<ModelImportChunkProgress | { error: string }> {
  const session = await requirePermission("master_data.manage");
  try {
    const file = await readUpload(formData);
    const offset = parseOffset(formData.get("offset"));
    const progress = await modelImportService.applyChunk({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      file,
      offset,
    });
    if (progress.done) {
      await invalidateModelsCache(session.user.tenantId);
      revalidatePath("/settings/master-data/models");
      revalidatePath("/settings/master-data/brands");
      revalidatePath("/settings/master-data/series");
    }
    return progress;
  } catch (error) {
    return { error: toMessage(error, "Import failed.") };
  }
}

/**
 * Full apply in one request (loops chunks server-side). Prefer the chunk action
 * from the import dialog so the UI can show progress and avoid timeouts.
 */
export async function applyModelImportAction(
  formData: FormData,
): Promise<{ success: true; result: ModelImportResult } | { error: string }> {
  const session = await requirePermission("master_data.manage");
  try {
    const file = await readUpload(formData);
    const result = await modelImportService.apply({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      file,
    });
    await invalidateModelsCache(session.user.tenantId);
    revalidatePath("/settings/master-data/models");
    revalidatePath("/settings/master-data/brands");
    revalidatePath("/settings/master-data/series");
    return { success: true as const, result };
  } catch (error) {
    return { error: toMessage(error, "Import failed.") };
  }
}
