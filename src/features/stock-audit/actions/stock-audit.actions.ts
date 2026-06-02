"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

function revalidateStockCountPaths(sessionId?: string) {
  revalidatePath("/inventory/stock-count");
  if (sessionId) {
    revalidatePath(`/inventory/stock-count/${sessionId}`);
  }
}

export async function listBranchesForStockCountAction() {
  const session = await requirePermission("inventory.manage");
  const unrestricted = isUnrestricted(session.user.permissions);
  if (unrestricted) {
    const branches = await branchRepository.listByTenant(session.user.tenantId);
    return branches.map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode }));
  }
  const branchIds = await aorService.getBranchIdsForUser(
    session.user.tenantId,
    session.user.id,
  );
  if (!branchIds.length) return [];
  const branches = await branchRepository.listByTenant(session.user.tenantId);
  return branches
    .filter((b) => branchIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode }));
}

export async function listStockCountSessionsAction(input?: { page?: number }) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return stockAuditService.listForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    { page: input?.page },
  );
}

export async function getStockCountSessionAction(sessionId: string) {
  const session = await requirePermission("inventory.view");
  return stockAuditService.getSession(session.user.tenantId, sessionId);
}

const createSessionSchema = z.object({ branchId: z.string().min(1) });

export async function createStockCountSessionAction(input: unknown) {
  const session = await requirePermission("inventory.manage");
  const parsed = createSessionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const row = await stockAuditService.createSession({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      branchId: parsed.data.branchId,
    });
    revalidateStockCountPaths(row?.id);
    return { success: true as const, sessionId: row?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create count session" };
  }
}

export async function startStockCountAction(sessionId: string) {
  const session = await requirePermission("inventory.manage");
  try {
    await stockAuditService.startCounting(
      session.user.tenantId,
      session.user.id,
      sessionId,
    );
    revalidateStockCountPaths(sessionId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start counting" };
  }
}

export async function recordStockCountLineAction(sessionId: string, lineId: string) {
  const session = await requirePermission("inventory.manage");
  try {
    await stockAuditService.recordCount(
      session.user.tenantId,
      session.user.id,
      sessionId,
      lineId,
    );
    revalidateStockCountPaths(sessionId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record count" };
  }
}

export async function completeStockCountAction(sessionId: string) {
  const session = await requirePermission("inventory.manage");
  try {
    await stockAuditService.completeCounting(
      session.user.tenantId,
      session.user.id,
      sessionId,
    );
    revalidateStockCountPaths(sessionId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to complete counting" };
  }
}

const investigateSchema = z.object({ notes: z.string().min(1) });

export async function investigateStockVarianceAction(
  varianceId: string,
  input: unknown,
) {
  const session = await requirePermission("inventory.manage");
  const parsed = investigateSchema.safeParse(input);
  if (!parsed.success) return { error: "Investigation notes are required" };

  try {
    await stockAuditService.investigateVariance(
      session.user.tenantId,
      session.user.id,
      varianceId,
      parsed.data.notes,
    );
    revalidateStockCountPaths();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to investigate variance" };
  }
}

export async function requestStockAdjustmentAction(varianceId: string) {
  const session = await requirePermission("inventory.manage");
  try {
    await stockAuditService.requestAdjustment(
      session.user.tenantId,
      session.user.id,
      varianceId,
    );
    revalidateStockCountPaths();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to request adjustment" };
  }
}

export async function closeStockCountSessionAction(sessionId: string) {
  const session = await requirePermission("inventory.manage");
  try {
    await stockAuditService.closeSession(
      session.user.tenantId,
      session.user.id,
      sessionId,
    );
    revalidateStockCountPaths(sessionId);
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to close session" };
  }
}
