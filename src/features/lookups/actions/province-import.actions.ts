"use server";

import { revalidatePath } from "next/cache";

import { lookupEntityRoute } from "@/features/lookups/constants/lookup-registry";
import type {
  ProvinceImportPreview,
  ProvinceImportResult,
} from "@/features/lookups/schemas/province-import.schema";
import { provinceImportService } from "@/features/lookups/services/province-import.service";
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
export async function downloadProvinceImportTemplateAction(): Promise<string> {
  const session = await requirePermission("master_data.manage");
  const workbook = await provinceImportService.buildTemplate(session.user.tenantId);
  return workbook.toString("base64");
}

/** Validates and diffs the upload without writing anything. */
export async function previewProvinceImportAction(
  formData: FormData,
): Promise<{ preview: ProvinceImportPreview } | { error: string }> {
  const session = await requirePermission("master_data.manage");
  try {
    const file = await readUpload(formData);
    const preview = await provinceImportService.preview(session.user.tenantId, file);
    return { preview };
  } catch (error) {
    return { error: toMessage(error, "Could not read the file.") };
  }
}

/** Re-plans from the same file server-side; the preview the browser saw is never the source of the writes. */
export async function applyProvinceImportAction(
  formData: FormData,
): Promise<{ success: true; result: ProvinceImportResult } | { error: string }> {
  const session = await requirePermission("master_data.manage");
  try {
    const file = await readUpload(formData);
    const result = await provinceImportService.apply({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      file,
    });
    revalidatePath(lookupEntityRoute("province"));
    return { success: true as const, result };
  } catch (error) {
    return { error: toMessage(error, "Import failed.") };
  }
}
