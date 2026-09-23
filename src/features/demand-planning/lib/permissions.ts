import { hasPermission } from "@/lib/auth/permissions";
import { hasOrderPermission } from "@/features/orders/constants/order-permissions";

export function canViewDemandPlanning(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "forecast.view") ||
    hasPermission(permissions, "forecast.manage")
  );
}

export function canManageDemandPlanning(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, "forecast.manage");
}

export function canCreateAutoReplenish(permissions: string[] | undefined): boolean {
  return hasOrderPermission(permissions, "auto_replenish", "create");
}

export function canReleaseDemandPlanning(permissions: string[] | undefined): boolean {
  return canManageDemandPlanning(permissions) && canCreateAutoReplenish(permissions);
}

/** Workbench Send: forecast.manage plus auto-replenish create (or legacy orders.create). */
export function canSendDemandPlanning(permissions: string[] | undefined): boolean {
  return canReleaseDemandPlanning(permissions);
}
