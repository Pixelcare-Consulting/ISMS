import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import type { Prisma } from "@prisma/client";

export type DraftOrderListSort = "sap" | "orderNumber" | "branch" | "status";
export type DraftOrderListSortDir = "asc" | "desc";

function draftOrderPrismaOrderBy(
  field: DraftOrderListSort,
  dir: DraftOrderListSortDir,
): Prisma.BranchOrderOrderByWithRelationInput {
  switch (field) {
    case "sap":
      return { branch: { sapCode: dir } };
    case "orderNumber":
      return { orderNumber: dir };
    case "branch":
      return { branch: { name: dir } };
    case "status":
      return { status: dir };
    default: {
      const _exhaustive: never = field;
      void _exhaustive;
      return { createdAt: dir };
    }
  }
}

function draftSuggestedOrdersWhere(
  tenantId: string,
  filters?: { branchId?: string; q?: string },
): Prisma.BranchOrderWhereInput {
  const q = filters?.q?.trim();
  return {
    tenantId,
    orderType: "auto_replenish",
    status: "draft",
    ...(filters?.branchId ? { branchId: filters.branchId } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { branch: { sapCode: { contains: q, mode: "insensitive" } } },
            { branch: { name: { contains: q, mode: "insensitive" } } },
            {
              details: {
                some: { model: { skuCode: { contains: q, mode: "insensitive" } } },
              },
            },
          ],
        }
      : {}),
  };
}

const SHELF_GAP_DRAFTS_RETIRED =
  "Shelf-gap drafts are no longer generated here. Auto replenish suggestions come from a released Supply Planning run via Suggested Orders.";

export const suggestedOrderService = {
  async generateSuggestedOrders(
    _tenantId: string,
    _periodId: string,
    _createdById: string,
  ) {
    throw new Error(SHELF_GAP_DRAFTS_RETIRED);
  },

  async submitDraftOrdersForReview(_tenantId: string, _actorUserId: string) {
    throw new Error(
      "Shelf-gap drafts are no longer submitted from here. Auto replenish suggestions come from a released Supply Planning run via Suggested Orders.",
    );
  },

  listDraftSuggestedOrders(tenantId: string) {
    return prisma.branchOrder.findMany({
      where: draftSuggestedOrdersWhere(tenantId),
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        details: {
          include: { model: { select: { skuCode: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async listDraftSuggestedOrdersPaginated(
    tenantId: string,
    pagination?: PaginationInput,
    filters?: { branchId?: string; q?: string },
    sort?: { field?: DraftOrderListSort; dir?: DraftOrderListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = draftSuggestedOrdersWhere(tenantId, filters);
    const orderBy = sort?.field
      ? draftOrderPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchOrder.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, sapCode: true } },
          details: {
            include: { model: { select: { skuCode: true, name: true } } },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchOrder.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },
};
