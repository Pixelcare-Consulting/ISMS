import type { BranchOrderStatus, BranchOrderType, Prisma } from "@prisma/client";

/**
 * One list branch. `statuses` omitted means every status (history).
 * An empty `statuses` array matches nothing and is left out of the OR.
 * `createdById` limits that branch to orders this person created.
 */
export interface OrderTypeScope {
  orderType: BranchOrderType;
  statuses?: BranchOrderStatus[];
  createdById?: string;
}

export function hasQueryableTypeScopes(typeScopes: readonly OrderTypeScope[]): boolean {
  return typeScopes.some((scope) => !scope.statuses || scope.statuses.length > 0);
}

/**
 * Tenant and branch scope sit outside the OR so every type branch shares them.
 * When `typeScopes` is set, each OR branch carries only that type's statuses.
 */
export function orderScopeWhere(
  tenantId: string,
  branchIds: string[] | null,
  scope?: {
    orderType?: BranchOrderType;
    statuses?: BranchOrderStatus[];
    typeScopes?: readonly OrderTypeScope[];
  },
): Prisma.BranchOrderWhereInput {
  const shared: Prisma.BranchOrderWhereInput = {
    tenantId,
    ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
  };

  if (scope?.typeScopes) {
    const or = scope.typeScopes.flatMap((entry) => {
      if (entry.statuses && entry.statuses.length === 0) return [];
      const branch: Prisma.BranchOrderWhereInput = {
        orderType: entry.orderType,
        ...(entry.statuses ? { status: { in: entry.statuses } } : {}),
        ...(entry.createdById ? { createdById: entry.createdById } : {}),
      };
      return [branch];
    });
    return {
      ...shared,
      OR: or.length > 0 ? or : [{ id: { in: [] } }],
    };
  }

  return {
    ...shared,
    ...(scope?.orderType ? { orderType: scope.orderType } : {}),
    ...(scope?.statuses ? { status: { in: scope.statuses } } : {}),
  };
}
