import type { BranchOrderStatus } from "@prisma/client";

import {
  canAccessOrderType,
  hasOrderPermission,
} from "@/features/orders/constants/order-permissions";
import { getOrderQueueStatuses } from "@/features/orders/constants/order-workflow";
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
 * Queue OR branches. Each type uses its own `getOrderQueueStatuses`, so Manual
 * pending_sp optional-edit visibility is not applied to Special rows.
 */
export function manualSpecialQueueScopes(
  permissions: string[] | undefined,
  roleSlugs: string[],
  filter: ManualSpecialTypeFilter,
): OrderTypeScope[] {
  return permittedManualSpecialTypes(permissions, filter).map((orderType) => ({
    orderType,
    statuses: getOrderQueueStatuses(orderType, roleSlugs, {
      includeDraft: hasOrderPermission(permissions, orderType, "create"),
    }),
  }));
}

/**
 * History keeps today's status set: no status predicate. The OR only limits type.
 */
export function manualSpecialHistoryScopes(
  permissions: string[] | undefined,
  filter: ManualSpecialTypeFilter,
): OrderTypeScope[] {
  return permittedManualSpecialTypes(permissions, filter).map((orderType) => ({
    orderType,
  }));
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
