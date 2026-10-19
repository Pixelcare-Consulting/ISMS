"use server";

import type { BranchOrderType } from "@prisma/client";

import {
  hasAnyOrderPermission,
  orderPermissionCandidates,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { orderAnalyticsService } from "@/features/orders/services/order-analytics.service";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

export async function getOrderWorksheetAction(input: {
  branchId: string;
  brandId?: string | null;
  orderType: BranchOrderType;
  existingModelIds?: string[];
  excludeOrderId?: string | null;
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
      data: await orderAnalyticsService.getWorksheet(session.user.tenantId, {
        branchId: input.branchId,
        brandId: input.brandId,
        orderType: input.orderType,
        existingModelIds: input.existingModelIds,
        excludeOrderId: input.excludeOrderId,
      }),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load order worksheet",
    };
  }
}

export async function listSpecialOrderModelsAction() {
  const session = await requireAnyPermission(orderPermissionCandidates("special", "create"));
  try {
    return {
      success: true as const,
      data: await orderAnalyticsService.listActiveModelsForSpecialOrder(session.user.tenantId),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load models",
    };
  }
}
