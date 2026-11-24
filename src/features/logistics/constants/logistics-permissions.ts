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
/** Opens Transfers read only. Each button keeps its own checkbox. */
export const LOGISTICS_DELIVERY_TRANSFER_VIEW = "logistics.delivery_transfer.view";
export const LOGISTICS_DELIVERY_TRANSFER_CREATE = "logistics.delivery_transfer.create";
export const LOGISTICS_DELIVERY_TRANSFER_APPROVE = "logistics.delivery_transfer.approve";
export const LOGISTICS_DELIVERY_TRANSFER_RECEIVE = "logistics.delivery_transfer.receive";
/** Opens the Pull-outs module. Each action keeps its own permission below. */
export const PULLOUTS_VIEW = "pullouts.view";
export const PULLOUTS_CREATE = "pullouts.create";
export const PULLOUTS_APPROVE = "pullouts.approve";
export const PULLOUTS_MANAGE = "pullouts.manage";

/**
 * Every action button and its server action checks only its own checkbox in Settings → Roles.
 * No other checkbox and no hidden legacy slug (`orders.*`) unlocks it, so unticking a box
 * always removes the button.
 */
export const PULLOUT_CREATE_PERMISSIONS = [PULLOUTS_CREATE] as const;

/** Pull-out Approve and Reject. */
export const PULLOUT_APPROVE_PERMISSIONS = [PULLOUTS_APPROVE] as const;

/** Pull-out list edit, Send, and Check SAP. */
export const PULLOUT_MANAGE_PERMISSIONS = [PULLOUTS_MANAGE] as const;

/** Transfers page Create. */
export const TRANSFER_PAGE_CREATE_PERMISSIONS = [LOGISTICS_DELIVERY_TRANSFER_CREATE] as const;

/** Transfers page Approve and Reject. */
export const TRANSFER_PAGE_APPROVE_PERMISSIONS = [LOGISTICS_DELIVERY_TRANSFER_APPROVE] as const;

/** Transfers page Receive and per-serial reject at receipt. */
export const TRANSFER_PAGE_RECEIVE_PERMISSIONS = [LOGISTICS_DELIVERY_TRANSFER_RECEIVE] as const;

/** Delivery Receive (accept units at the branch). */
export const DELIVERY_RECEIVE_PERMISSIONS = [LOGISTICS_DELIVERY_RECEIVE] as const;

/**
 * "Check SAP now" has no checkbox of its own. It sits next to Dispatch and Manage on Deliveries,
 * and next to Approve on Orders, so each of those checkboxes shows it.
 */
export const SAP_CHECK_PERMISSIONS = [
  LOGISTICS_DELIVERY_DISPATCH,
  LOGISTICS_MANAGE,
  ...anyOrderTypePermissions("approve"),
];

/** Any of these opens Deliveries and Transfers (lists, KPIs, details). */
export const LOGISTICS_PAGE_PERMISSIONS = [
  LOGISTICS_VIEW,
  LOGISTICS_CREATE,
  LOGISTICS_MANAGE,
  LOGISTICS_DELIVERY_RECEIVE,
] as const;

/**
 * Opens Transfers (list, detail, KPIs): any Branch transfers checkbox, or Branch deliveries
 * View/Create/Manage/Receive. Branch transfers View alone is read only (e.g. Accounting).
 */
export const TRANSFERS_PAGE_PERMISSIONS = [
  LOGISTICS_DELIVERY_TRANSFER_VIEW,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  ...LOGISTICS_PAGE_PERMISSIONS,
] as const;

/**
 * Capability map for deliveries and the Transfers page.
 * Pull-out buttons use {@link PULLOUT_ACTION_CAPABILITIES}.
 * Hidden unit transfers stay on `canCreateDeliveryTransfer` and its siblings.
 */
export const LOGISTICS_ACTION_CAPABILITIES = {
  canCreate: TRANSFER_PAGE_CREATE_PERMISSIONS,
  canManage: LOGISTICS_MANAGE,
  canApproveTl: TRANSFER_PAGE_APPROVE_PERMISSIONS,
  canRejectTransfer: TRANSFER_PAGE_APPROVE_PERMISSIONS,
  canDispatch: LOGISTICS_DELIVERY_DISPATCH,
  canAcceptDelivery: DELIVERY_RECEIVE_PERMISSIONS,
  canRequestDeliveryReturn: LOGISTICS_DELIVERY_RETURN_REQUEST,
  canApproveDeliveryReturn: LOGISTICS_DELIVERY_RETURN_APPROVE,
  canCreateDeliveryTransfer: LOGISTICS_DELIVERY_TRANSFER_CREATE,
  canApproveDeliveryTransfer: LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  canReceiveDeliveryTransfer: LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
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
