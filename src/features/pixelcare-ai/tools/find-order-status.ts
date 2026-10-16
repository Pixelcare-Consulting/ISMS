import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import {
  hasAnyOrderPermission,
  ORDER_TYPE_ROUTE,
} from "@/features/orders/constants/order-permissions";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import {
  isCanonicalSalesOrderNumber,
  MAX_ORDER_LOOKUPS,
  resolveOrderLookupQueries,
} from "@/features/pixelcare-ai/lib/sales-order-numbers";
import { retrievedAt } from "@/features/pixelcare-ai/tools/tool-payload";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const MISS_NOTE = "Not found in your access scope.";

const orderInclude = {
  branch: { select: { id: true, name: true } },
  approvalLevels: {
    orderBy: { level: "asc" as const },
    select: {
      level: true,
      roleSlug: true,
      approvedAt: true,
      rejectedAt: true,
      comment: true,
    },
  },
};

type OrderRow = {
  id: string;
  orderNumber: string;
  status: BranchOrderStatus;
  orderType: BranchOrderType;
  branch: { id: string; name: string };
  approvalLevels: Array<{
    level: number;
    roleSlug: string;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    comment: string | null;
  }>;
};

export type OrderStatusHit = {
  id: string;
  orderNumber: string;
  status: BranchOrderStatus;
  statusLabel: string;
  orderType: BranchOrderType;
  branchId: string;
  branchName: string;
  href: string;
  history: Array<{
    level: number;
    role: string;
    approvedAt: string | null;
    rejectedAt: string | null;
    comment: string | null;
  }>;
};

export type OrderStatusLookup =
  | { query: string; found: true; orders: OrderStatusHit[] }
  | { query: string; found: false; note: string };

export type FindOrderStatusPayload = {
  sample: false;
  retrievedAt: string;
  lookups: OrderStatusLookup[];
  orders: OrderStatusHit[];
  misses: string[];
  sourceHref: "/orders";
  note?: string;
  nextSteps?: Array<{ label: string; href: string }>;
};

export type FindOrderStatusResult = { error: string } | FindOrderStatusPayload;

function branchScopeWhere(
  branchIds: string[] | null,
): { branchId: { in: string[] } } | Record<string, never> {
  if (branchIds && branchIds.length > 0) return { branchId: { in: branchIds } };
  if (branchIds && branchIds.length === 0) return { branchId: { in: [] } };
  return {};
}

function toHit(order: OrderRow): OrderStatusHit {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: BRANCH_ORDER_STATUS_LABELS[order.status] ?? order.status,
    orderType: order.orderType,
    branchId: order.branch.id,
    branchName: order.branch.name,
    href: ORDER_TYPE_ROUTE[order.orderType],
    history: order.approvalLevels.map((level) => ({
      level: level.level,
      role: level.roleSlug,
      approvedAt: level.approvedAt ? level.approvedAt.toISOString() : null,
      rejectedAt: level.rejectedAt ? level.rejectedAt.toISOString() : null,
      comment: level.comment,
    })),
  };
}

function sameNumber(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export async function findOrderStatuses(input: {
  tenantId: string;
  userId: string;
  permissions: string[];
  orderNumber?: string | null;
  orderNumbers?: readonly string[] | null;
  fromMessage?: readonly string[] | null;
}): Promise<FindOrderStatusResult> {
  const { queries: requested, truncated } = resolveOrderLookupQueries(input);
  if (requested.length === 0) {
    return { error: "Provide at least one order number." };
  }

  const fullAccess =
    hasPermission(input.permissions, "branches.manage") ||
    hasAnyOrderPermission(input.permissions, "approve");
  const branchIds = fullAccess
    ? null
    : await getUserBranchIds(input.tenantId, input.userId);
  const scope = branchScopeWhere(branchIds);

  const canonical = requested.filter(isCanonicalSalesOrderNumber);
  const partials = requested.filter((query) => !isCanonicalSalesOrderNumber(query));
  const rowsByQuery = new Map<string, OrderRow[]>();

  if (canonical.length > 0) {
    const rows = await prisma.branchOrder.findMany({
      where: {
        tenantId: input.tenantId,
        OR: canonical.map((orderNumber) => ({
          orderNumber: { equals: orderNumber, mode: "insensitive" as const },
        })),
        ...scope,
      },
      take: MAX_ORDER_LOOKUPS,
      orderBy: { updatedAt: "desc" },
      include: orderInclude,
    });
    for (const query of canonical) {
      rowsByQuery.set(
        query,
        rows.filter((row) => sameNumber(row.orderNumber, query)),
      );
    }
  }

  for (const query of partials) {
    const rows = await prisma.branchOrder.findMany({
      where: {
        tenantId: input.tenantId,
        orderNumber: { contains: query, mode: "insensitive" as const },
        ...scope,
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: orderInclude,
    });
    rowsByQuery.set(query, rows);
  }

  const lookups: OrderStatusLookup[] = requested.map((query) => {
    const hits = (rowsByQuery.get(query) ?? []).map(toHit);
    if (hits.length === 0) {
      return { query, found: false, note: MISS_NOTE };
    }
    return { query, found: true, orders: hits };
  });

  const orders = lookups.flatMap((lookup) => (lookup.found ? lookup.orders : []));
  const misses = lookups.filter((lookup) => !lookup.found).map((lookup) => lookup.query);
  const notes: string[] = [];
  if (misses.length > 0) {
    notes.push(
      misses.length === lookups.length
        ? "No matching orders in your access scope. Do not guess a status."
        : "Some order numbers were not found in your access scope. Do not guess a status.",
    );
  }
  if (truncated) {
    notes.push(`Only the first ${MAX_ORDER_LOOKUPS} order numbers were looked up.`);
  }

  const nextSteps = orders.map((order) => ({
    label: `Open ${order.orderNumber}`,
    href: order.href,
  }));

  return {
    sample: false,
    retrievedAt: retrievedAt(),
    lookups,
    orders,
    misses,
    sourceHref: "/orders",
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
  };
}
