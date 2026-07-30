"use server";

import { getDashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";

export async function getDashboardKpisAction() {
  const session = await requireAuth();
  const perms = session.user.permissions ?? [];
  const hasOps =
    hasPermission(perms, "inventory.view") ||
    hasAnyOrderPermission(perms, "view") ||
    hasPermission(perms, "sales.create");

  if (!hasOps) {
    return null;
  }

  const fullAccess =
    hasAnyOrderPermission(perms, "approve") || hasPermission(perms, "branches.manage");

  return getDashboardKpis(session.user.tenantId, session.user.id, fullAccess);
}
