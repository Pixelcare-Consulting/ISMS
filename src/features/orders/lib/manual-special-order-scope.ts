import type { BranchOrderStatus } from "@prisma/client";

import {
  canAccessOrderType,
  hasOrderPermission,
} from "@/features/orders/constants/order-permissions";
import {
  getOrderQueueStatuses,
  isOwnOrdersOnly,
} from "@/features/orders/constants/order-workflow";
import type { OrderTypeScope } from "@/features/orders/lib/order-scope-where";

export const MANUAL_SPECIAL_TYPE_FILTERS = ["all", "manual", "special"] as const;

export type ManualSpecialTypeFilter = (typeof MANUAL_SPECIAL_TYPE_FILTERS)[number];

export type ManualSpecialOrderType = Exclude<OrderTypeScope["orderType"], "auto_replenish">;

const MANUAL_SPECIAL_ORDER_TYPES = ["manual", "special"] as const satisfies readonly ManualSpecialOrderType[];

export function parseManualSpecialTypeFilter(
  value: string | undefined,
): ManualSpecialTypeFilter {
  switch (value) {
    case "manual":
    case "special":
    case "all":
      return value;
    default:
      return "all";
  }
}

/** Types the viewer may open, narrowed by the All / Manual / Special filter. */
export function permittedManualSpecialTypes(
  permissions: string[] | undefined,
  filter: ManualSpecialTypeFilter,
): ManualSpecialOrderType[] {
  const wanted: readonly ManualSpecialOrderType[] =
    filter === "all" ? MANUAL_SPECIAL_ORDER_TYPES : [filter];
  return wanted.filter((orderType) => canAccessOrderType(permissions, orderType));
}

/**
 * Without "See everyone's orders" for a type, that type's scope only matches orders the
 * viewer created. Each type is limited on its own.
 */
function withOwnOrdersLimit(
  scopes: OrderTypeScope[],
  permissions: string[] | undefined,
  viewerUserId?: string,
): OrderTypeScope[] {
  if (!viewerUserId) return scopes;
  return scopes.map((scope) =>
    isOwnOrdersOnly(scope.orderType, permissions)
      ? { ...scope, createdById: viewerUserId }
      : scope,
  );
}

/**
 * Queue OR branches. Each type uses its own `getOrderQueueStatuses`, so Manual
 * pending_sp optional-edit visibility is not applied to Special rows.
 * Special Pending SP stays an approver step for everyone else. The creator
 * still sees their own order at that step.
 * Without "See everyone's orders" a type is limited to `createdById`, including that step.
 */
export function manualSpecialQueueScopes(
  permissions: string[] | undefined,
  filter: ManualSpecialTypeFilter,
  viewerUserId?: string,
): OrderTypeScope[] {
  const scopes = permittedManualSpecialTypes(permissions, filter).map((orderType) => ({
    orderType,
    statuses: getOrderQueueStatuses(orderType, permissions, {
      includeDraft: hasOrderPermission(permissions, orderType, "create"),
    }),
  }));

  const withCreatorSpecial = appendCreatorSpecialPendingSp(scopes, viewerUserId);
  return withOwnOrdersLimit(withCreatorSpecial, permissions, viewerUserId);
}

function appendCreatorSpecialPendingSp(
  scopes: OrderTypeScope[],
  viewerUserId?: string,
): OrderTypeScope[] {
  if (!viewerUserId) return scopes;
  const special = scopes.find((scope) => scope.orderType === "special");
  if (!special || special.statuses?.includes("pending_sp")) return scopes;

  return [
    ...scopes,
    {
      orderType: "special",
      statuses: ["pending_sp"],
      createdById: viewerUserId,
    },
  ];
}

/**
 * History keeps today's status set: no status predicate. The OR only limits type.
 * Without "See everyone's orders" a type still only shows orders the viewer created.
 */
export function manualSpecialHistoryScopes(
  permissions: string[] | undefined,
  filter: ManualSpecialTypeFilter,
  viewerUserId?: string,
): OrderTypeScope[] {
  const scopes = permittedManualSpecialTypes(permissions, filter).map((orderType) => ({
    orderType,
  }));
  return withOwnOrdersLimit(scopes, permissions, viewerUserId);
}

/** KPI cards follow the queue status set, in the existing status order. */
export function manualSpecialQueueStatusKeys(
  typeScopes: readonly OrderTypeScope[],
  statusOrder: readonly BranchOrderStatus[],
): BranchOrderStatus[] {
  const allowed = new Set<BranchOrderStatus>();
  for (const scope of typeScopes) {
    for (const status of scope.statuses ?? []) allowed.add(status);
  }
  return statusOrder.filter((status) => allowed.has(status));
}
