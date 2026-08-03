"use server";

import { resolveDashboardCapabilities } from "@/features/dashboard/constants/dashboard-permissions";
import {
  getDashboardAnalytics,
  getDashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";

function resolveOpsAccess(permissions: string[] | undefined) {
  const caps = resolveDashboardCapabilities(permissions);
  const fullAccess =
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage");

  return { hasOps: caps.hasOps, fullAccess };
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
