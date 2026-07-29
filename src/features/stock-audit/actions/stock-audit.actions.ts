"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import {
  hasPermission,
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from "@/lib/auth/permissions";
import { aorService } from "@/features/aors/services/aor.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import { STOCK_COUNT_PERMISSION_MESSAGE } from "@/features/stock-audit/constants/stock-count-permissions";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";

const PCOUNT_REPORT_ACCESS = ["reports.view", "inventory.view"] as const;

function isUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

/** Soft permission check for client-called manage actions — returns error instead of redirecting. */
async function requireStockCountManage() {
  const session = await requireAuth();
  if (!hasPermission(session.user.permissions, "inventory.manage")) {
    return { error: STOCK_COUNT_PERMISSION_MESSAGE as string, session: null };
  }
  return { error: null, session };
}

function revalidateStockCountPaths(sessionId?: string) {
  revalidatePath("/inventory/stock-count");
  revalidatePath("/reports/pcount");
  if (sessionId) {
    revalidatePath(`/inventory/stock-count/${sessionId}`);
  }
}

export async function listBranchesForStockCountAction() {
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

  const unrestricted = isUnrestricted(session.user.permissions);
  if (unrestricted) {
    const branches = await branchRepository.listByTenant(session.user.tenantId);
    return {
      branches: branches.map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode })),
    };
  }
  const branchIds = await aorService.getBranchIdsForUser(
    session.user.tenantId,
    session.user.id,
  );
  if (!branchIds.length) return { branches: [] };
  const branches = await branchRepository.listByTenant(session.user.tenantId);
  return {
    branches: branches
      .filter((b) => branchIds.includes(b.id))
      .map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode })),
  };
}

export async function listStockCountSessionsAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  const limit = parseTablePageSize(input?.limit);
  return stockAuditService.listForUser(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    { page: input?.page, limit },
  );
}

export async function getStockCountKpisAction() {
  const session = await requirePermission("inventory.view");
  const unrestricted = isUnrestricted(session.user.permissions);
  return stockAuditService.getKpis(
    session.user.tenantId,
    session.user.id,
    unrestricted,
  );
}

export async function getStockCountSessionAction(sessionId: string) {
  const session = await requirePermission("inventory.view");
  return stockAuditService.getSession(session.user.tenantId, sessionId);
}

const createSessionSchema = z.object({ branchId: z.string().min(1) });

export async function createStockCountSessionAction(input: unknown) {
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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
  const { error, session } = await requireStockCountManage();
  if (error || !session) return { error: error ?? STOCK_COUNT_PERMISSION_MESSAGE };

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

export async function listPcountReportAction(input?: {
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
}) {
  const session = await requireAnyPermission([...PCOUNT_REPORT_ACCESS]);
  const unrestricted = isUnrestricted(session.user.permissions);
  return stockAuditService.listClosedForReport(
    session.user.tenantId,
    session.user.id,
    unrestricted,
    {
      branchId: input?.branchId || undefined,
      from: input?.from ? new Date(input.from) : undefined,
      to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
      page: input?.page,
    },
  );
}

export async function listBranchesForPcountReportAction() {
  const session = await requireAnyPermission([...PCOUNT_REPORT_ACCESS]);
  const unrestricted = isUnrestricted(session.user.permissions);
  if (unrestricted) {
    const branches = await branchRepository.listByTenant(session.user.tenantId);
    return branches.map((b) => ({ id: b.id, name: b.name }));
  }
  const branchIds = await aorService.getBranchIdsForUser(
    session.user.tenantId,
    session.user.id,
  );
  if (!branchIds.length) return [];
  const branches = await branchRepository.listByTenant(session.user.tenantId);
  return branches
    .filter((b) => branchIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name }));
}
