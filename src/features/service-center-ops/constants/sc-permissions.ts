import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { hasPermission } from "@/lib/auth/permissions";
import type { SalesActionCapabilities } from "@/features/sales/constants/sales-permissions";
import type { PulloutActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

export const SC_INVENTORY_VIEW = "service_centers.inventory.view";
export const SC_SALES_VIEW = "service_centers.sales.view";
export const SC_SALES_CREATE = "service_centers.sales.create";
/** Edit SC sale headers (Accounting), like `sales.update` on branch sales. */
export const SC_SALES_UPDATE = "service_centers.sales.update";
export const SC_ORDERS_VIEW = "service_centers.orders.view";
export const SC_ORDERS_CREATE = "service_centers.orders.create";
export const SC_ORDERS_APPROVE = "service_centers.orders.approve";
/** Supply Planning approval of SC orders. The older SC orders Approve does not approve orders. */
export const SC_ORDERS_APPROVE_SP = "service_centers.orders.approve_sp";
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

/**
 * Sales Transactions → Service Center tab (read only). Create / update no longer encode or edit
 * SC sales; they still open the tab, and roles keep using create as a grant for SC returns.
 */
export const SC_SALES_ACCESS = [
  SC_SALES_VIEW,
  SC_SALES_CREATE,
  SC_SALES_UPDATE,
] as const;

/** The old SC orders Approve is hidden and no longer opens the page. */
export const SC_ORDERS_ACCESS = [SC_ORDERS_VIEW, SC_ORDERS_CREATE, SC_ORDERS_APPROVE_SP] as const;

export const SC_LOGISTICS_ACCESS = [
  SC_LOGISTICS_VIEW,
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
] as const;

/**
 * Create, Manage, and Approve each check only their own checkbox. Accepting, rejecting at
 * receipt, and Check SAP have no checkbox of their own and follow Create or Manage.
 */
export const SC_LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: SC_LOGISTICS_CREATE,
  canManage: SC_LOGISTICS_MANAGE,
  canAcceptDelivery: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  /** Reject DR units at receipt: ISMS posts the SAP Return and the units go back to SAP. */
  canRejectDelivery: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  /** Check SAP now on Deliveries: DRs copied from SC Sales Orders become SC deliveries. */
  canCheckSap: [SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE],
  canApprovePullout: SC_LOGISTICS_APPROVE,
} as const;

export type ScLogisticsActionCapabilities = ResolvedCapabilities<
  typeof SC_LOGISTICS_ACTION_CAPABILITIES
>;

/**
 * The Service Center tab uses the branch sales table and dialogs, so it resolves the same
 * capability shape, read only: its rows are copies of branch sales. Requests start on the
 * branch sale and the service center finishes them in SC Returns.
 */
export function resolveScSalesCapabilities(
  permissions: string[] | undefined,
): SalesActionCapabilities {
  return {
    canViewSalesList: canAccessScSales(permissions),
    canViewReturns: false,
    canCreateSale: false,
    canUpdateSaleHeader: false,
    canRequestReturn: false,
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

/** SC orders have one approval step, Supply Planning, on its own checkbox. */
export function canApproveScOrders(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, SC_ORDERS_APPROVE_SP);
}

export const SC_ORDER_APPROVER_ONLY = "Only Supply Planning can approve or reject service center orders";

export function canAccessScOrders(permissions: string[] | undefined): boolean {
  return SC_ORDERS_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canAccessScLogistics(permissions: string[] | undefined): boolean {
  return SC_LOGISTICS_ACCESS.some((slug) => hasPermission(permissions, slug));
}

export function canProcessScServiceReturns(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, SC_RETURNS_PROCESS);
}
