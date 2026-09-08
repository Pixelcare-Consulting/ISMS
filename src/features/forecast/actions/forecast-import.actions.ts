"use server";

import { revalidatePath } from "next/cache";

import type {
  ForecastImportChunkProgress,
  ForecastImportPreview,
  ForecastImportResult,
} from "@/features/forecast/schemas/forecast-import.schema";
import { forecastImportService } from "@/features/forecast/services/forecast-import.service";
import { requireAnyPermission } from "@/lib/auth/permissions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function readUpload(formData: FormData): Promise<Buffer> {
  const buffer = await readOptionalUpload(formData);
  if (!buffer) throw new Error("Choose an .xlsx or .csv file to upload.");
  return buffer;
}

/** Apply chunks normally send only a plan key; the file rides along on a cache miss. */
async function readOptionalUpload(formData: FormData): Promise<Buffer | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("The file is larger than 5 MB.");
  }
  return Buffer.from(await file.arrayBuffer());
}

function parsePlanKey(raw: FormDataEntryValue | null): string | undefined {
  return typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
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

function actorFromSession(session: {
  user: { id: string; tenantId: string; permissions: string[] };
}) {
  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    permissions: session.user.permissions,
  };
}

async function requireForecastManage() {
  return requireAnyPermission(["forecast.manage", "planogram.manage"]);
}

function revalidateForecastPaths() {
  revalidatePath("/settings/planning");
  revalidatePath("/planning/suggested-orders");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

/** Returns the workbook base64-encoded — server action results must be serializable. */
export async function downloadForecastImportTemplateAction(): Promise<string> {
  const session = await requireForecastManage();
  const workbook = await forecastImportService.buildTemplate(actorFromSession(session));
  return workbook.toString("base64");
}

/** Validates and diffs the upload without writing anything. */
export async function previewForecastImportAction(
  formData: FormData,
): Promise<{ preview: ForecastImportPreview } | { error: string }> {
  const session = await requireForecastManage();
  try {
    const file = await readUpload(formData);
    const { preview, planKey } = await forecastImportService.buildPlan(
      actorFromSession(session),
      file,
    );
    return { preview: { ...preview, planKey } };
  } catch (error) {
    return { error: toMessage(error, "Could not read the file.") };
  }
}

/**
 * Applies one offset chunk against the server-built plan.
 *
 * The browser passes a `planKey` — a digest of the file it uploaded to `preview` —
 * so the plan is fetched from the server-side cache instead of the workbook being
 * re-uploaded and re-diffed per chunk. The plan the browser saw is still never the
 * source of the writes. On a cache miss the response sets `planExpired` and the
 * client retries the same offset with the file attached.
 *
 * Revalidate runs only on the final chunk.
 */
export async function applyForecastImportChunkAction(
  formData: FormData,
): Promise<ForecastImportChunkProgress | { error: string }> {
  const session = await requireForecastManage();
  try {
    const file = await readOptionalUpload(formData);
    const planKey = parsePlanKey(formData.get("planKey"));
    if (!file && !planKey) {
      throw new Error("Choose an .xlsx or .csv file to upload.");
    }
    const offset = parseOffset(formData.get("offset"));
    const progress = await forecastImportService.applyChunk({
      actor: actorFromSession(session),
      file: file ?? undefined,
      planKey,
      offset,
    });
    if (progress.done) {
      revalidateForecastPaths();
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
export async function applyForecastImportAction(
  formData: FormData,
): Promise<{ success: true; result: ForecastImportResult } | { error: string }> {
  const session = await requireForecastManage();
  try {
    const file = await readUpload(formData);
    const result = await forecastImportService.apply({
      actor: actorFromSession(session),
      file,
    });
    revalidateForecastPaths();
    return { success: true as const, result };
  } catch (error) {
    return { error: toMessage(error, "Import failed.") };
  }
}
