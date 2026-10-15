"use server";

import type { BranchOrderType } from "@prisma/client";

import {
  getDeliveryActionableStatusCodes,
  getPulloutActionableStatusCodes,
  getTransferActionableStatusCodes,
} from "@/features/logistics/constants/logistics-actionable-statuses";
import {
  canAccessLogistics,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { logisticsRepository } from "@/features/logistics/repositories/logistics.repository";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import {
  canAccessOrderType,
  hasAnyOrderPermission,
} from "@/features/orders/constants/order-permissions";
import { getOrderActionableQueueStatuses } from "@/features/orders/constants/order-workflow";
import { orderService } from "@/features/orders/services/order.service";
import { getReturnsActionableApprovalStatuses } from "@/features/returns/constants/returns-actionable-statuses";
import {
  canViewApprovalsTab,
  resolveReturnsCapabilities,
} from "@/features/returns/constants/returns-permissions";
import { returnsKpiService } from "@/features/returns/services/returns-kpi.service";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";

export type WorkflowNavCountBadges = {
  monthlySirPending: number;
  ordersManualQueue: number;
  ordersSpecialQueue: number;
  ordersAutoReplenishQueue: number;
  returnsApprovals: number;
  logisticsDeliveries: number;
  logisticsTransfers: number;
  logisticsPullouts: number;
};

const EMPTY_WORKFLOW_BADGES: WorkflowNavCountBadges = {
  monthlySirPending: 0,
  ordersManualQueue: 0,
  ordersSpecialQueue: 0,
  ordersAutoReplenishQueue: 0,
  returnsApprovals: 0,
  logisticsDeliveries: 0,
  logisticsTransfers: 0,
  logisticsPullouts: 0,
};

function isInventoryUnrestricted(permissions: string[] | undefined) {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage")
  );
}

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

async function countOrderQueue(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
  roleSlugs: string[],
  orderType: BranchOrderType,
): Promise<number> {
  if (!canAccessOrderType(permissions, orderType)) return 0;
  const statuses = getOrderActionableQueueStatuses(orderType, roleSlugs);
  if (statuses.length === 0) return 0;
  return orderService.countActionableQueue(
    tenantId,
    userId,
    hasFullOrderAccess(permissions),
    orderType,
    statuses,
  );
}

/**
 * Live sidebar counts for workflow queues (permission / role / AOR scoped).
 * Safe for layout: never throws; returns zeros when unauthorized.
 */
export async function getWorkflowNavCountBadgesAction(): Promise<WorkflowNavCountBadges> {
  try {
    const session = await requireAuth();
    const tenantId = session.user.tenantId;
    const userId = session.user.id;
    const permissions = session.user.permissions;
    const roleSlugs = session.user.roleSlugs ?? [];

    const [
      monthlySirPending,
      ordersManualQueue,
      ordersSpecialQueue,
      ordersAutoReplenishQueue,
      returnsApprovals,
      logisticsDeliveries,
      logisticsTransfers,
      logisticsPullouts,
    ] = await Promise.all([
      (async () => {
        if (!hasPermission(permissions, "inventory.manage")) return 0;
        return monthlySirService.countPendingForUser(
          tenantId,
          userId,
          isInventoryUnrestricted(permissions),
        );
      })(),
      countOrderQueue(tenantId, userId, permissions, roleSlugs, "manual"),
      countOrderQueue(tenantId, userId, permissions, roleSlugs, "special"),
      countOrderQueue(
        tenantId,
        userId,
        permissions,
        roleSlugs,
        "auto_replenish",
      ),
      (async () => {
        if (!canViewApprovalsTab(permissions)) return 0;
        const capabilities = resolveReturnsCapabilities(permissions);
        const statuses = getReturnsActionableApprovalStatuses(capabilities);
        if (statuses.length === 0) return 0;
        const scopedIds = await resolveScIdsForUser(
          tenantId,
          userId,
          permissions,
        );
        return returnsKpiService.countActionableApprovals(
          tenantId,
          scopedIds,
          statuses,
        );
      })(),
      (async () => {
        if (!canAccessLogistics(permissions)) return 0;
        const caps = resolveLogisticsCapabilities(permissions);
        const codes = getDeliveryActionableStatusCodes(caps);
        return logisticsRepository.countDeliveriesByStatusCodes(tenantId, codes);
      })(),
      (async () => {
        if (!canAccessLogistics(permissions)) return 0;
        const caps = resolveLogisticsCapabilities(permissions);
        const codes = getTransferActionableStatusCodes(caps);
        return logisticsRepository.countTransfersByStatusCodes(tenantId, codes);
      })(),
      (async () => {
        if (!canAccessLogistics(permissions)) return 0;
        const caps = resolveLogisticsCapabilities(permissions);
        const codes = getPulloutActionableStatusCodes(caps);
        return logisticsRepository.countPulloutsByStatusCodes(tenantId, codes);
      })(),
    ]);

    return {
      monthlySirPending,
      ordersManualQueue,
      ordersSpecialQueue,
      ordersAutoReplenishQueue,
      returnsApprovals,
      logisticsDeliveries,
      logisticsTransfers,
      logisticsPullouts,
    };
  } catch {
    return { ...EMPTY_WORKFLOW_BADGES };
  }
}
