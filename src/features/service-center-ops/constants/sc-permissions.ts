import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";
import {
  isSuperAdminOrderOverride,
  isSupplyPlanningApproverRole,
} from "@/features/orders/constants/order-workflow";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import type { PulloutActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

export const SC_INVENTORY_VIEW = "service_centers.inventory.view";
export const SC_SALES_VIEW = "service_centers.sales.view";
export const SC_SALES_CREATE = "service_centers.sales.create";
/** Edit SC sale headers (Accounting), like `sales.update` on branch sales. */
export const SC_SALES_UPDATE = "service_centers.sales.update";
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
/** Service center pull-out Approve and Reject. */
export const SC_LOGISTICS_APPROVE = "service_centers.logistics.approve";
export const SC_MANAGE = "service_centers.manage";
/**
 * Finish a Service Return / Replacement the CSR sent to a service center (Process V-b):
 * submit the return into SC stock, replace from SC stock, raise a special order, or reject.
 */
export const SC_RETURNS_PROCESS = "service_centers.returns.process";

/** SC Sales list / encode / header edit. */
export const SC_SALES_ACCESS = [
  SC_SALES_VIEW,
  SC_SALES_CREATE,
  SC_SALES_UPDATE,
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

export const SC_LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  canManage: SC_LOGISTICS_MANAGE,
  canAcceptDelivery: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  /** Reject DR units at receipt: ISMS posts the SAP Return and the units go back to SAP. */
  canRejectDelivery: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  /** Check SAP now on Deliveries: DRs copied from SC Sales Orders become SC deliveries. */
  canCheckSap: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  canApprovePullout: [SC_LOGISTICS_APPROVE, SC_ORDERS_APPROVE, SC_LOGISTICS_MANAGE],
} as const;

export type ScLogisticsActionCapabilities = ResolvedCapabilities<
  typeof SC_LOGISTICS_ACTION_CAPABILITIES
>;

/** Request a Service Return / Replacement on an SC sale line (Process V-b). */
export const SC_SERVICE_RETURN_REQUEST_PERMISSIONS = [SC_RETURN_REQUEST, SC_SALES_CREATE] as const;

/**
 * SC Sales uses the branch sales table and dialogs, so it resolves the same capability
 * shape. The CSR can request a Service Return / Replacement; the selling service center
 * finishes it in SC Returns, so the branch evaluate / approve / complete steps stay off.
 */
export function resolveScSalesCapabilities(
  permissions: string[] | undefined,
): SalesActionCapabilities {
  const can = (slug: string) => hasPermission(permissions, slug);
  return {
    canViewSalesList: SC_SALES_ACCESS.some(can),
    canViewReturns: false,
    canCreateSale: can(SC_SALES_CREATE),
    canUpdateSaleHeader: can(SC_SALES_UPDATE),
    canRequestReturn: SC_SERVICE_RETURN_REQUEST_PERMISSIONS.some(can),
    canEvaluateReturn: false,
    canApproveReturn: false,
    canCompleteReturn: false,
  };
}

/**
 * SC pull-outs use the branch pull-out list and detail page, so they resolve the same
 * capability shape: create (request), Team Lead approve/reject, and Logistics list/Send.
 */
export function resolveScPulloutCapabilities(
  permissions: string[] | undefined,
): PulloutActionCapabilities {
  const caps = resolveScLogisticsCapabilities(permissions);
  return {
    canCreate: caps.canCreate,
    canManage: caps.canManage,
    canApproveTl: caps.canApprovePullout,
    canRejectTransfer: caps.canApprovePullout,
  };
}

export function resolveScLogisticsCapabilities(
  permissions: string[] | undefined,
): ScLogisticsActionCapabilities {
  return resolveCapabilities(permissions, SC_LOGISTICS_ACTION_CAPABILITIES);
}

export function canAccessScSales(permissions: string[] | undefined): boolean {
  return SC_SALES_ACCESS.some((slug) => hasPermission(permissions, slug));
}

/**
 * SC orders have one approval step, Supply Planning, like branch orders. The permission alone
 * is not enough: Team Leaders hold it for SC pull-out approval.
 */
export function canApproveScOrders(
  permissions: string[] | undefined,
  roleSlugs: string[] | undefined,
): boolean {
  const roles = roleSlugs ?? [];
  return (
    hasPermission(permissions, SC_ORDERS_APPROVE) &&
    (isSupplyPlanningApproverRole(roles) || isSuperAdminOrderOverride(roles))
  );
}

export const SC_ORDER_APPROVER_ONLY = "Only Supply Planning can approve or reject service center orders";

export function canAccessScOrders(permissions: string[] | undefined): boolean {
  return SC_ORDERS_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canAccessScLogistics(permissions: string[] | undefined): boolean {
  return SC_LOGISTICS_ACCESS.some((slug) => hasPermission(permissions, slug));
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

export function canProcessScServiceReturns(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, SC_RETURNS_PROCESS);
}
