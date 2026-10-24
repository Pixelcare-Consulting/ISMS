"use server";

import {
  hasDashboardFullAccess,
  resolveDashboardCapabilities,
} from "@/features/dashboard/constants/dashboard-permissions";
import {
  getDashboardAnalytics,
  getDashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { canAccessSales } from "@/features/sales/constants/sales-permissions";
import { canAccessReturns } from "@/features/returns/constants/returns-permissions";
import { requireAuth } from "@/lib/auth/permissions";

function resolveOpsAccess(permissions: string[] | undefined) {
  const caps = resolveDashboardCapabilities(permissions);
  return { hasOps: caps.hasOps, fullAccess: hasDashboardFullAccess(permissions) };
}

export async function getDashboardKpisAction() {
  const session = await requireAuth();
  const { hasOps, fullAccess } = resolveOpsAccess(session.user.permissions);

  if (!hasOps) {
    return null;
  }

  return getDashboardKpis(session.user.tenantId, session.user.id, fullAccess);
}

export async function getDashboardAnalyticsAction() {
  const session = await requireAuth();
  const { hasOps, fullAccess } = resolveOpsAccess(session.user.permissions);

  if (!hasOps) {
    return null;
  }

  return getDashboardAnalytics(session.user.tenantId, session.user.id, fullAccess);
}

export async function getDashboardSalesAnalyticsAction() {
  const session = await requireAuth();
  const permissions = session.user.permissions;

  if (!canAccessSales(permissions) && !canAccessReturns(permissions)) {
    return null;
  }

  return getDashboardSalesAnalytics(
    session.user.tenantId,
    session.user.id,
    hasDashboardFullAccess(permissions),
  );
}
