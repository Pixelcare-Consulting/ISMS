import {
  resolveCapabilities,
  type ResolvedCapabilities,
} from "@/lib/auth/action-capabilities";
import { anyOrderTypePermissions } from "@/features/orders/constants/order-permissions";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Logistics action-button permissions.
 *
 * Recipe: see `src/lib/auth/action-capabilities.ts`.
 * Admins toggle these in Settings → Roles after seed.
 */

export const LOGISTICS_VIEW = "logistics.view";
export const LOGISTICS_CREATE = "logistics.create";
export const LOGISTICS_MANAGE = "logistics.manage";
export const LOGISTICS_DELIVERY_DISPATCH = "logistics.delivery.dispatch";
export const LOGISTICS_DELIVERY_RECEIVE = "logistics.delivery.receive";
export const LOGISTICS_DELIVERY_RETURN_REQUEST = "logistics.delivery_return.request";
export const LOGISTICS_DELIVERY_RETURN_APPROVE = "logistics.delivery_return.approve";
export const LOGISTICS_DELIVERY_TRANSFER_CREATE = "logistics.delivery_transfer.create";
export const LOGISTICS_DELIVERY_TRANSFER_APPROVE = "logistics.delivery_transfer.approve";
export const LOGISTICS_DELIVERY_TRANSFER_RECEIVE = "logistics.delivery_transfer.receive";
/** Opens the Pull-outs module. Each action keeps its own permission below. */
export const PULLOUTS_VIEW = "pullouts.view";
export const PULLOUTS_CREATE = "pullouts.create";
export const PULLOUTS_APPROVE = "pullouts.approve";
export const PULLOUTS_MANAGE = "pullouts.manage";

/**
 * Pull-out Create. Visible transfer Create uses {@link TRANSFER_PAGE_CREATE_PERMISSIONS}
 * so a pull-out checkbox does not start a transfer.
 */
export const PULLOUT_CREATE_PERMISSIONS = [
  PULLOUTS_CREATE,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  "orders.create",
] as const;

/** Pull-out Approve and Reject. Transfer Approve uses the Branch transfers checkbox. */
export const PULLOUT_APPROVE_PERMISSIONS = [
  PULLOUTS_APPROVE,
  "orders.approve",
  LOGISTICS_MANAGE,
] as const;

/** Pull-out list edit, Send, and Check SAP. Delivery and transfer Manage stay on logistics.manage. */
export const PULLOUT_MANAGE_PERMISSIONS = [PULLOUTS_MANAGE, LOGISTICS_MANAGE] as const;

/** Visible Transfers page Create, plus the aliases that already started a transfer. */
export const TRANSFER_PAGE_CREATE_PERMISSIONS = [
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  "orders.create",
] as const;

/** Visible Transfers page Approve and Reject. */
export const TRANSFER_PAGE_APPROVE_PERMISSIONS = [
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  "orders.approve",
  LOGISTICS_MANAGE,
] as const;

/** Visible Transfers page Receive, plus the aliases that already received a transfer. */
export const TRANSFER_PAGE_RECEIVE_PERMISSIONS = [
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  "orders.create",
] as const;

/** "Check SAP now": Logistics on Deliveries, and order approvers on Orders. */
export const SAP_CHECK_PERMISSIONS = [
  LOGISTICS_DELIVERY_DISPATCH,
  LOGISTICS_MANAGE,
  ...anyOrderTypePermissions("approve"),
];

/** Any of these grants Logistics nav + list access. */
export const LOGISTICS_ACCESS_PERMISSIONS = [
  LOGISTICS_VIEW,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  LOGISTICS_DELIVERY_RECEIVE,
] as const;

/**
 * Legacy order slugs kept for one release so PS/TL who only have orders.*
 * can still open deliveries / transfers / pull-outs.
 */
export const LOGISTICS_READ_ALIASES = [
  "orders.create",
  "orders.view",
] as const;

/** Page / list / KPI gate: logistics.* or legacy order aliases. */
export const LOGISTICS_PAGE_PERMISSIONS = [
  ...LOGISTICS_ACCESS_PERMISSIONS,
  ...LOGISTICS_READ_ALIASES,
] as const;

/**
 * Capability map for deliveries and the Transfers page.
 * Pull-out buttons use {@link PULLOUT_ACTION_CAPABILITIES} so those checkboxes
 * do not unlock a delivery or a transfer. Older slugs stay as fallbacks.
 * Hidden unit transfers stay on `canCreateDeliveryTransfer` and its siblings.
 */
export const LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: TRANSFER_PAGE_CREATE_PERMISSIONS,
  canManage: LOGISTICS_MANAGE,
  canApproveTl: TRANSFER_PAGE_APPROVE_PERMISSIONS,
  canRejectTransfer: TRANSFER_PAGE_APPROVE_PERMISSIONS,
  canDispatch: [LOGISTICS_DELIVERY_DISPATCH, LOGISTICS_MANAGE],
  canAcceptDelivery: [
    LOGISTICS_CREATE,
    LOGISTICS_MANAGE,
    "orders.create",
    LOGISTICS_DELIVERY_RECEIVE,
  ],
  canRequestDeliveryReturn: [LOGISTICS_DELIVERY_RETURN_REQUEST],
  canApproveDeliveryReturn: [LOGISTICS_DELIVERY_RETURN_APPROVE],
  canCreateDeliveryTransfer: [LOGISTICS_DELIVERY_TRANSFER_CREATE],
  canApproveDeliveryTransfer: [LOGISTICS_DELIVERY_TRANSFER_APPROVE],
  canReceiveDeliveryTransfer: [LOGISTICS_DELIVERY_TRANSFER_RECEIVE],
  canExecuteTransfer: LOGISTICS_MANAGE,
  canReceiveTransfer: TRANSFER_PAGE_RECEIVE_PERMISSIONS,
  canSchedulePullout: PULLOUT_MANAGE_PERMISSIONS,
  canReleasePullout: PULLOUT_CREATE_PERMISSIONS,
  canCompletePullout: PULLOUT_MANAGE_PERMISSIONS,
} as const;

/** Buttons on the branch pull-out list and detail page. */
export const PULLOUT_ACTION_CAPABILITIES = {
  canCreate: PULLOUT_CREATE_PERMISSIONS,
  canManage: PULLOUT_MANAGE_PERMISSIONS,
  canApproveTl: PULLOUT_APPROVE_PERMISSIONS,
  canRejectTransfer: PULLOUT_APPROVE_PERMISSIONS,
} as const;

export type LogisticsActionCapabilities = ResolvedCapabilities<
  typeof LOGISTICS_ACTION_CAPABILITIES
>;

/**
 * The buttons the shared pull-out list and detail page show. Branch pull-outs resolve them
 * from pull-out permissions, service center pull-outs from SC logistics permissions.
 */
export type PulloutActionCapabilities = ResolvedCapabilities<
  typeof PULLOUT_ACTION_CAPABILITIES
>;

export function resolveLogisticsCapabilities(
  permissions: string[] | undefined,
): LogisticsActionCapabilities {
  return resolveCapabilities(permissions, LOGISTICS_ACTION_CAPABILITIES);
}

export function resolvePulloutCapabilities(
  permissions: string[] | undefined,
): PulloutActionCapabilities {
  return resolveCapabilities(permissions, PULLOUT_ACTION_CAPABILITIES);
}

export function canViewPullouts(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, PULLOUTS_VIEW);
}

export function canAccessLogistics(permissions: string[] | undefined): boolean {
  return LOGISTICS_PAGE_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}
