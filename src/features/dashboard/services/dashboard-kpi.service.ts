import { orderService } from "@/features/orders/services/order.service";
import { planogramService } from "@/features/planogram/services/planogram.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { prisma } from "@/lib/database/client";
import { getUserBranchIds, branchScopeFilter } from "@/lib/aor/scope";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";

export interface DashboardKpis {
  pendingOrderApprovals: number;
  deliveryInTransit: number;
  stockCount: number;
  openAtr: number;
  belowPlanogramCapacity: number;
  milBreaches: number;
}

async function computeDashboardKpis(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardKpis> {
  const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
  const scope = branchScopeFilter(branchIds);

  const [ditCode, stkCode] = await Promise.all([
    reasonStatusRepository.findCodeId(tenantId, "inventory_system", "DIT"),
    reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK"),
  ]);

  const [pendingOrderApprovals, deliveryInTransit, stockCount, openAtr, planogramAlerts] =
    await Promise.all([
      orderService.countPendingApprovals(tenantId),
      ditCode
        ? prisma.branchInventory.count({
            where: { tenantId, statusCodeId: ditCode.id, ...scope },
          })
        : Promise.resolve(0),
      stkCode
        ? prisma.branchInventory.count({
            where: { tenantId, statusCodeId: stkCode.id, ...scope },
          })
        : Promise.resolve(0),
      prisma.branchSalesTransaction.count({
        where: { tenantId, atrStatus: "open", ...scope },
      }),
      planogramService.getMilAndCapacityAlerts(tenantId, branchIds),
    ]);

  return {
    pendingOrderApprovals,
    deliveryInTransit,
    stockCount,
    openAtr,
    belowPlanogramCapacity: planogramAlerts.belowCapacity,
    milBreaches: planogramAlerts.milBreaches,
  };
}

export async function getDashboardKpis(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardKpis> {
  const scopeKey = hasFullAccess ? "full" : userId;
  return getOrSet(
    cacheKey("tenant", tenantId, "dashboard-kpis", scopeKey),
    CACHE_TTL.dashboardKpis,
    () => computeDashboardKpis(tenantId, userId, hasFullAccess),
  );
}
