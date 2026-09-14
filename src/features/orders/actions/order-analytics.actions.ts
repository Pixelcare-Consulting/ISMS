"use server";

import type { BranchOrderType } from "@prisma/client";

import { branchService } from "@/features/branches/services/branch.service";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import {
  hasAnyOrderPermission,
  orderPermissionCandidates,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { getUserBranchIds } from "@/lib/aor/scope";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

async function resolveOrderBranchScope(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
): Promise<string[] | null> {
  if (hasFullOrderAccess(permissions)) return null;
  return getUserBranchIds(tenantId, userId);
}

export async function listOrderAnalyticsBranchesAction(orderType: BranchOrderType) {
  const session = await requireAnyPermission(orderTypeAccessPermissions(orderType));
  const branches = await branchService.listActiveBranches(session.user.tenantId);
  const branchScope = await resolveOrderBranchScope(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  if (branchScope !== null && branchScope.length === 0) {
    return [];
  }
  const allowed = branchScope === null ? null : new Set(branchScope);
  return branches
    .filter((b) => (allowed ? allowed.has(b.id) : true))
    .map((b) => ({
      id: b.id,
      name: b.name,
      dealerId: b.dealerId,
    }));
}

export async function getOrderAnalyticsAction(input: {
  branchId: string;
  brandId?: string | null;
  orderType: BranchOrderType;
}) {
  const session = await requireAnyPermission(orderTypeAccessPermissions(input.orderType));
  try {
    await orderAnalyticsService.assertBranchInScope(
      session.user.tenantId,
      session.user.id,
      input.branchId,
      hasFullOrderAccess(session.user.permissions),
    );
    return {
      success: true as const,
      data: await orderAnalyticsService.getAnalytics(session.user.tenantId, input),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load order analytics" };
  }
}

export async function getBranchOrderWorkspaceAction(input: {
  branchId: string;
  brandId?: string | null;
  orderType: BranchOrderType;
}) {
  const session = await requireAnyPermission(
    orderPermissionCandidates(input.orderType, "create"),
  );
  try {
    await orderAnalyticsService.assertBranchInScope(
      session.user.tenantId,
      session.user.id,
      input.branchId,
      hasFullOrderAccess(session.user.permissions),
    );
    return {
      success: true as const,
      data: await orderAnalyticsService.getWorkspace(session.user.tenantId, input),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load order workspace" };
  }
}
