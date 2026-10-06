"use server";

import { revalidatePath } from "next/cache";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  createMonthlySirRequestSchema,
  monthlySirScansSchema,
  monthlySirUploadSchema,
  reviewMonthlySirRequestSchema,
} from "@/features/monthly-sir/schemas/monthly-sir.schema";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import {
  hasPermission,
  requirePermission,
} from "@/lib/auth/permissions";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

function revalidateMonthlySir(sessionId?: string) {
  revalidatePath("/inventory/monthly-sir");
  revalidatePath("/inventory/stock-count");
  if (sessionId) revalidatePath(`/inventory/stock-count/${sessionId}`);
}

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

async function uploadBuffer(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Select a P-COUNT Excel file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("The file is larger than 10 MB");
  }
  return Buffer.from(await file.arrayBuffer());
}

export async function listMonthlySirRequestsAction(input?: {
  tab?: "all" | "approval";
  branchId?: string;
  page?: number;
  limit?: number;
}) {
  const session = await requirePermission("inventory.view");
  return monthlySirService.list(
    session.user.tenantId,
    session.user.id,
    isUnrestricted(session.user.permissions),
    {
      branchId: input?.branchId || undefined,
      status: input?.tab === "approval" ? "pending" : undefined,
      page: input?.page,
      limit: parseTablePageSize(input?.limit),
    },
  );
}

export async function listMonthlySirBranchesAction() {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  const branches = await branchRepository.listByTenant(session.user.tenantId);
  if (unrestricted) {
    return branches.map(({ id, name, sapCode }) => ({ id, name, sapCode }));
  }
  const branchIds = await aorService.getBranchIdsForUser(
    session.user.tenantId,
    session.user.id,
  );
  return branches
    .filter((branch) => branchIds.includes(branch.id))
    .map(({ id, name, sapCode }) => ({ id, name, sapCode }));
}

export async function createMonthlySirRequestAction(input: unknown) {
  const session = await requirePermission("inventory.view");
  const parsed = createMonthlySirRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  try {
    const request = await monthlySirService.createRequest({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      unrestricted: isUnrestricted(session.user.permissions),
      ...parsed.data,
    });
    revalidateMonthlySir();
    return { success: true as const, requestId: request.id };
  } catch (error) {
    return actionError(error, "Failed to create Monthly SIR request");
  }
}

export async function reviewMonthlySirRequestAction(input: unknown) {
  const session = await requirePermission("inventory.manage");
  const parsed = reviewMonthlySirRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid review details" };
  try {
    const request = await monthlySirService.review({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      unrestricted: isUnrestricted(session.user.permissions),
      requestId: parsed.data.requestId,
      decision: parsed.data.decision,
      remarks: parsed.data.remarks,
    });
    revalidateMonthlySir(request.stockCountSessionId ?? undefined);
    return { success: true as const };
  } catch (error) {
    return actionError(error, "Failed to review Monthly SIR request");
  }
}

export async function downloadMonthlySirTemplateAction(requestId: string) {
  const session = await requirePermission("inventory.view");
  try {
    const result = await monthlySirService.buildTemplate({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      requestId,
      unrestricted: isUnrestricted(session.user.permissions),
      generatedBy: session.user.name || session.user.email || "ISMS user",
    });
    return { base64: result.buffer.toString("base64"), filename: result.filename };
  } catch (error) {
    return actionError(error, "Failed to build P-COUNT template");
  }
}

export async function validateMonthlySirScansAction(input: unknown) {
  const session = await requirePermission("inventory.view");
  const parsed = monthlySirScansSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid scanned serials" };
  }
  try {
    return await monthlySirService.validateScans({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      unrestricted: isUnrestricted(session.user.permissions),
      ...parsed.data,
    });
  } catch (error) {
    return actionError(error, "Failed to validate scanned serials");
  }
}

export async function buildMonthlySirTemplateFromScansAction(input: unknown) {
  const session = await requirePermission("inventory.view");
  const parsed = monthlySirScansSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid scanned serials" };
  }
  try {
    const result = await monthlySirService.buildTemplateFromScans({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      unrestricted: isUnrestricted(session.user.permissions),
      generatedBy: session.user.name || session.user.email || "ISMS user",
      ...parsed.data,
    });
    return { base64: result.buffer.toString("base64"), filename: result.filename };
  } catch (error) {
    return actionError(error, "Failed to build P-COUNT from scans");
  }
}

export async function previewMonthlySirUploadAction(formData: FormData) {
  const session = await requirePermission("inventory.view");
  const parsed = monthlySirUploadSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { error: "Invalid Monthly SIR request" };
  try {
    const file = await uploadBuffer(formData);
    return await monthlySirService.previewUpload({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      requestId: parsed.data.requestId,
      unrestricted: isUnrestricted(session.user.permissions),
      file,
    });
  } catch (error) {
    return actionError(error, "Failed to preview P-COUNT upload");
  }
}

export async function applyMonthlySirUploadAction(formData: FormData) {
  const session = await requirePermission("inventory.view");
  const parsed = monthlySirUploadSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { error: "Invalid Monthly SIR request" };
  try {
    const file = await uploadBuffer(formData);
    const result = await monthlySirService.applyUpload({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      requestId: parsed.data.requestId,
      unrestricted: isUnrestricted(session.user.permissions),
      file,
    });
    revalidateMonthlySir();
    return { success: true as const, ...result };
  } catch (error) {
    return actionError(error, "Failed to apply P-COUNT upload");
  }
}

export async function generateMonthlySirVarianceAction(requestId: string) {
  const session = await requirePermission("inventory.view");
  try {
    const result = await monthlySirService.buildVariance({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      requestId,
      unrestricted: isUnrestricted(session.user.permissions),
      generatedBy: session.user.name || session.user.email || "ISMS user",
    });
    return { base64: result.buffer.toString("base64"), filename: result.filename };
  } catch (error) {
    return actionError(error, "Failed to generate P-COUNT variance");
  }
}
