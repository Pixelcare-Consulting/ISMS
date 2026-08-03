import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { orderService } from "@/features/orders/services/order.service";
import { planogramService } from "@/features/planogram/services/planogram.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";
import { prisma } from "@/lib/database/client";
import { getUserBranchIds, branchScopeFilter } from "@/lib/aor/scope";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";
import type { KpiStatusCount } from "@/lib/kpi-cards";

export interface DashboardKpis {
  pendingOrderApprovals: number;
  deliveryInTransit: number;
  stockCount: number;
  openAtr: number;
  belowPlanogramCapacity: number;
  milBreaches: number;
  allocationGapCount: number;
  draftSuggestedOrders: number;
}

export interface DashboardPeriodSnapshot {
  ordersThisMonth: number;
  salesThisMonth: number;
  deliveryInTransit: number;
}

export interface DashboardAnalytics {
  inventoryByStatus: KpiStatusCount[];
  ordersByStatus: KpiStatusCount[];
  periodSnapshot: DashboardPeriodSnapshot;
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function computeDashboardKpis(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardKpis> {
  const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
  const scope = branchScopeFilter(branchIds);

  const [ditCode, stkCode, activePeriod] = await Promise.all([
    reasonStatusRepository.findCodeId(tenantId, "inventory_system", "DIT"),
    reasonStatusRepository.findCodeId(tenantId, "inventory_system", "STK"),
    forecastRepository.findActivePeriod(tenantId),
  ]);

  const [
    pendingOrderApprovals,
    deliveryInTransit,
    stockCount,
    openAtr,
    planogramAlerts,
    allocationGapCount,
    draftSuggestedOrders,
  ] = await Promise.all([
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
    activePeriod
      ? forecastRepository.countGapsForPeriod(tenantId, activePeriod.id)
      : Promise.resolve(0),
    forecastRepository.countDraftAutoReplenishOrders(tenantId),
  ]);

  return {
    pendingOrderApprovals,
    deliveryInTransit,
    stockCount,
    openAtr,
    belowPlanogramCapacity: planogramAlerts.belowCapacity,
    milBreaches: planogramAlerts.milBreaches,
    allocationGapCount,
    draftSuggestedOrders,
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

async function computePeriodSnapshot(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardPeriodSnapshot> {
  const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
  const scope = branchScopeFilter(branchIds);
  const monthStart = startOfCurrentMonth();

  const ditCode = await reasonStatusRepository.findCodeId(
    tenantId,
    "inventory_system",
    "DIT",
  );

  const [ordersThisMonth, salesThisMonth, deliveryInTransit] = await Promise.all([
    prisma.branchOrder.count({
      where: { tenantId, createdAt: { gte: monthStart }, ...scope },
    }),
    prisma.branchSalesTransaction.count({
      where: { tenantId, createdAt: { gte: monthStart }, ...scope },
    }),
    ditCode
      ? prisma.branchInventory.count({
          where: { tenantId, statusCodeId: ditCode.id, ...scope },
        })
      : Promise.resolve(0),
  ]);

  return { ordersThisMonth, salesThisMonth, deliveryInTransit };
}

async function computeDashboardAnalytics(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardAnalytics> {
  const [inventoryKpis, orderKpis, periodSnapshot] = await Promise.all([
    inventoryService.getKpis(tenantId, userId, hasFullAccess),
    orderService.getKpis(tenantId, userId, hasFullAccess),
    computePeriodSnapshot(tenantId, userId, hasFullAccess),
  ]);

  return {
    inventoryByStatus: inventoryKpis.statuses,
    ordersByStatus: orderKpis.statuses,
    periodSnapshot,
  };
}

export async function getDashboardAnalytics(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardAnalytics> {
  const scopeKey = hasFullAccess ? "full" : userId;
  return getOrSet(
    cacheKey("tenant", tenantId, "dashboard-analytics-v2", scopeKey),
    CACHE_TTL.dashboardKpis,
    () => computeDashboardAnalytics(tenantId, userId, hasFullAccess),
  );
}
