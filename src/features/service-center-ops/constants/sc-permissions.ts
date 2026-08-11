import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";

export const SC_INVENTORY_VIEW = "service_centers.inventory.view";
export const SC_SALES_VIEW = "service_centers.sales.view";
export const SC_SALES_CREATE = "service_centers.sales.create";
export const SC_RETURN_REQUEST = "service_centers.return.request";
export const SC_RETURN_EVALUATE = "service_centers.return.evaluate";
export const SC_RETURN_APPROVE = "service_centers.return.approve";
export const SC_RETURN_COMPLETE = "service_centers.return.complete";
export const SC_ORDERS_VIEW = "service_centers.orders.view";
export const SC_ORDERS_CREATE = "service_centers.orders.create";
export const SC_ORDERS_APPROVE = "service_centers.orders.approve";
export const SC_LOGISTICS_VIEW = "service_centers.logistics.view";
export const SC_LOGISTICS_CREATE = "service_centers.logistics.create";
export const SC_LOGISTICS_MANAGE = "service_centers.logistics.manage";
export const SC_MANAGE = "service_centers.manage";

/** SC Sales encode/list — return processing lives under Returns / Replacement. */
export const SC_SALES_ACCESS = [
  SC_SALES_VIEW,
  SC_SALES_CREATE,
] as const;

export const SC_ORDERS_ACCESS = [
  SC_ORDERS_VIEW,
  SC_ORDERS_CREATE,
  SC_ORDERS_APPROVE,
] as const;

export const SC_LOGISTICS_ACCESS = [
  SC_LOGISTICS_VIEW,
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
] as const;

export const SC_SALES_ACTION_CAPABILITIES = {
  canCreateSale: SC_SALES_CREATE,
  canRequestReturn: [
    "returns.request",
    SC_RETURN_REQUEST,
    SC_SALES_CREATE,
  ],
  canEvaluateReturn: ["returns.evaluate", SC_RETURN_EVALUATE],
  canApproveReturn: [
    "returns.approve",
    SC_RETURN_APPROVE,
    SC_ORDERS_APPROVE,
  ],
  canCompleteReturn: [
    "returns.complete",
    SC_RETURN_COMPLETE,
    SC_LOGISTICS_MANAGE,
    SC_SALES_CREATE,
  ],
} as const;

export const SC_LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  canManage: SC_LOGISTICS_MANAGE,
  canAcceptDelivery: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  canApprovePullout: [SC_ORDERS_APPROVE, SC_LOGISTICS_MANAGE],
  canCompletePullout: SC_LOGISTICS_MANAGE,
} as const;

export type ScSalesActionCapabilities = ResolvedCapabilities<
  typeof SC_SALES_ACTION_CAPABILITIES
>;

export type ScLogisticsActionCapabilities = ResolvedCapabilities<
  typeof SC_LOGISTICS_ACTION_CAPABILITIES
>;

export function resolveScSalesCapabilities(
  permissions: string[] | undefined,
): ScSalesActionCapabilities {
  return resolveCapabilities(permissions, SC_SALES_ACTION_CAPABILITIES);
}

export function resolveScLogisticsCapabilities(
  permissions: string[] | undefined,
): ScLogisticsActionCapabilities {
  return resolveCapabilities(permissions, SC_LOGISTICS_ACTION_CAPABILITIES);
}

export function canAccessScSales(permissions: string[] | undefined): boolean {
  return SC_SALES_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canAccessScOrders(permissions: string[] | undefined): boolean {
  return SC_ORDERS_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canAccessScLogistics(permissions: string[] | undefined): boolean {
  return SC_LOGISTICS_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canManualStockIn(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, SC_MANAGE) ||
    hasPermission(permissions, SC_LOGISTICS_MANAGE) ||
    hasPermission(permissions, SC_LOGISTICS_CREATE)
  );
}

export function scReturnRejectPermissions(status: string): string[] {
  if (status === "pending_cs") {
    return ["returns.evaluate", SC_RETURN_EVALUATE, SC_SALES_CREATE];
  }
  if (status === "pending_tl") {
    return ["returns.approve", SC_RETURN_APPROVE, SC_ORDERS_APPROVE];
  }
  return [
    "returns.evaluate",
    "returns.approve",
    SC_RETURN_EVALUATE,
    SC_RETURN_APPROVE,
    SC_SALES_CREATE,
    SC_ORDERS_APPROVE,
  ];
}
