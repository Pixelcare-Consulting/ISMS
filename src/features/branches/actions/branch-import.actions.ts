"use server";

import { revalidatePath } from "next/cache";

import { branchImportService } from "@/features/branches/services/branch-import.service";
import type {
  BranchImportChunkPhase,
  BranchImportChunkProgress,
  BranchImportPreview,
  BranchImportResult,
} from "@/features/branches/schemas/branch-import.schema";
import { requirePermission } from "@/lib/auth/permissions";

function parseChunkPhase(raw: FormDataEntryValue | null): BranchImportChunkPhase {
  if (raw === "core" || raw === "enrich") return raw;
  throw new Error("Invalid import phase.");
}

function parseOffset(raw: FormDataEntryValue | null): number {
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid import offset.");
  }
  return value;
}

function parseNonNegativeInt(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Invalid planned import count.");
  }
  return value;
}

/** Pre-apply preview totals echoed by the client so final counts survive core upserts. */
function parsePlannedResult(formData: FormData): BranchImportResult | undefined {
  const branchesCreated = parseNonNegativeInt(formData.get("plannedCreated"));
  const branchesUpdated = parseNonNegativeInt(formData.get("plannedUpdated"));
  const allowedModelsAdded = parseNonNegativeInt(formData.get("plannedAllowed"));
  const unchanged = parseNonNegativeInt(formData.get("plannedUnchanged"));
  if (
    branchesCreated == null ||
    branchesUpdated == null ||
    allowedModelsAdded == null ||
    unchanged == null
  ) {
    return undefined;
  }
  return { branchesCreated, branchesUpdated, allowedModelsAdded, unchanged };
}

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
 * Re-parses the same file server-side and applies one chunk (core or enrich).
 * The plan the browser saw is never trusted as the source of the writes.
 */
export async function applyBranchImportChunkAction(
  formData: FormData,
): Promise<BranchImportChunkProgress | { error: string }> {
  const session = await requirePermission("branches.manage");
  try {
    const file = await readUpload(formData);
    const phase = parseChunkPhase(formData.get("phase"));
    const offset = parseOffset(formData.get("offset"));
    const plannedResult = parsePlannedResult(formData);
    const progress = await branchImportService.applyChunk({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      file,
      phase,
      offset,
      plannedResult,
    });
    if (progress.done) {
      revalidatePath("/settings/branches");
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
