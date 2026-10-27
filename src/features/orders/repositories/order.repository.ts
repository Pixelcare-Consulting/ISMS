import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import {
  getInitialOrderStatus,
  getOrderApprovalChain,
  TEAM_LEADER_ROLE_SLUG,
} from "@/features/orders/constants/order-workflow";
import {
  hasQueryableTypeScopes,
  orderScopeWhere,
  type OrderTypeScope,
} from "@/features/orders/lib/order-scope-where";
import {
  isSalesOrderNumberConflict,
  MAX_SALES_ORDER_NUMBER_ATTEMPTS,
  nextSalesOrderNumber,
  orderModeOfPaymentKind,
  orderNumberPrefix,
  SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE,
} from "@/features/orders/utils/next-sales-order-number";
import type { BranchOrderStatus, BranchOrderType, Prisma, SapOrderDocType } from "@prisma/client";

/** Shown when approval is attempted against a row that changed after it was opened. */
export const ORDER_CHANGED_MESSAGE = "This order changed. Refresh and review again.";

const orderListInclude = {
  branch: {
    select: {
      id: true,
      name: true,
      sapCode: true,
      deliverySchedule: true,
      dealer: { select: { name: true, modeOfPayment: { select: { name: true, kind: true } } } },
    },
  },
  modeOfPayment: { select: { name: true, kind: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  details: {
    include: {
      model: {
        select: {
          id: true,
          skuCode: true,
          name: true,
          brandId: true,
          srp: true,
          cbm: true,
          priceLists: {
            select: {
              amount: true,
              periodStart: true,
              periodEnd: true,
              packageTypeId: true,
            },
          },
        },
      },
    },
  },
  approvalLevels: {
    orderBy: { level: "asc" as const },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.BranchOrderInclude;

function singleTypeScopeWhere(
  tenantId: string,
  branchIds: string[] | null,
  orderType?: BranchOrderType,
  statuses?: BranchOrderStatus[],
) {
  return orderScopeWhere(tenantId, branchIds, { orderType, statuses });
}

export type OrderListSort =
  | "orderNumber"
  | "branch"
  | "orderType"
  | "status"
  | "createdAt";
export type OrderListSortDir = "asc" | "desc";

function orderPrismaOrderBy(
  field: OrderListSort,
  dir: OrderListSortDir,
): Prisma.BranchOrderOrderByWithRelationInput {
  switch (field) {
    case "orderNumber":
      return { orderNumber: dir };
    case "branch":
      return { branch: { name: dir } };
    case "orderType":
      return { orderType: dir };
    case "status":
      return { status: dir };
    case "createdAt":
      return { createdAt: dir };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export const orderRepository = {
  /**
   * Team Leaders with at least one AOR branch, for the order list filter. With a branch
   * scope, only TLs covering at least one of those branches.
   */
  listTeamLeaderOptions(tenantId: string, branchIds: string[] | null) {
    return prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        userRoles: { some: { role: { slug: TEAM_LEADER_ROLE_SLUG, deletedAt: null } } },
        aors: { some: { tenantId, branchId: branchIds ? { in: branchIds } : { not: null } } },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
  },

  async listForTenant(
    tenantId: string,
    branchIds: string[] | null,
    pagination?: {
      page?: number;
      limit?: number;
      orderType?: BranchOrderType;
      statuses?: BranchOrderStatus[];
      /** One query. Each entry is that type's own status set. Replaces orderType + statuses. */
      typeScopes?: OrderTypeScope[];
    },
    sort?: { field?: OrderListSort; dir?: OrderListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    if (pagination?.typeScopes) {
      if (!hasQueryableTypeScopes(pagination.typeScopes)) {
        return toPaginatedResult([], 0, page, limit);
      }
    } else if (pagination?.statuses && pagination.statuses.length === 0) {
      return toPaginatedResult([], 0, page, limit);
    }
    const where = pagination?.typeScopes
      ? orderScopeWhere(tenantId, branchIds, { typeScopes: pagination.typeScopes })
      : singleTypeScopeWhere(
          tenantId,
          branchIds,
          pagination?.orderType,
          pagination?.statuses,
        );
    const orderBy = sort?.field
      ? orderPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    const [items, total] = await Promise.all([
      prisma.branchOrder.findMany({
        where,
        include: orderListInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.branchOrder.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  countAll(
    tenantId: string,
    branchIds: string[] | null,
    orderType?: BranchOrderType,
    statuses?: BranchOrderStatus[],
    typeScopes?: OrderTypeScope[],
  ) {
    if (typeScopes) {
      if (!hasQueryableTypeScopes(typeScopes)) return Promise.resolve(0);
      return prisma.branchOrder.count({
        where: orderScopeWhere(tenantId, branchIds, { typeScopes }),
      });
    }
    if (statuses && statuses.length === 0) return Promise.resolve(0);
    return prisma.branchOrder.count({
      where: singleTypeScopeWhere(tenantId, branchIds, orderType, statuses),
    });
  },

  countByStatus(
    tenantId: string,
    branchIds: string[] | null,
    orderType?: BranchOrderType,
    statuses?: BranchOrderStatus[],
    typeScopes?: OrderTypeScope[],
  ) {
    if (typeScopes) {
      if (!hasQueryableTypeScopes(typeScopes)) return Promise.resolve([]);
      return prisma.branchOrder.groupBy({
        by: ["status"],
        where: orderScopeWhere(tenantId, branchIds, { typeScopes }),
        _count: { id: true },
      });
    }
    if (statuses && statuses.length === 0) return Promise.resolve([]);
    return prisma.branchOrder.groupBy({
      by: ["status"],
      where: singleTypeScopeWhere(tenantId, branchIds, orderType, statuses),
      _count: { id: true },
    });
  },

  findById(tenantId: string, id: string) {
    return prisma.branchOrder.findFirst({
      where: { id, tenantId },
      include: {
        branch: true,
        details: { include: { model: true } },
        approvalLevels: {
          orderBy: { level: "asc" },
          include: {
            approvedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  },

  /** History page load: same branch scope as the order list, priced like history rows. */
  findScopedById(
    tenantId: string,
    id: string,
    branchIds: string[] | null,
    orderType: BranchOrderType,
  ) {
    return prisma.branchOrder.findFirst({
      where: {
        id,
        tenantId,
        orderType,
        ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
      },
      include: orderListInclude,
    });
  },

  /**
   * Manual or special order for the submitted-order page.
   * Branch scope matches the order list. Line amount is the stored value only.
   */
  findManualOrSpecialById(tenantId: string, id: string, branchIds: string[] | null) {
    return prisma.branchOrder.findFirst({
      where: {
        id,
        tenantId,
        orderType: { in: ["manual", "special"] },
        ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
      },
      select: {
        id: true,
        orderNumber: true,
        orderType: true,
        status: true,
        branchId: true,
        notes: true,
        sapDocType: true,
        sapDocNum: true,
        reviewSnapshot: true,
        reviewSnapshotAt: true,
        createdAt: true,
        processedAt: true,
        createdById: true,
        createdBy: { select: { name: true, email: true } },
        branch: {
          select: {
            name: true,
            dealer: {
              select: {
                name: true,
                modeOfPayment: { select: { name: true } },
              },
            },
          },
        },
        modeOfPayment: { select: { name: true } },
        details: {
          orderBy: { model: { skuCode: "asc" } },
          select: {
            id: true,
            modelId: true,
            quantity: true,
            amount: true,
            remarks: true,
            spRemarks: true,
            model: { select: { skuCode: true, name: true, cbm: true } },
          },
        },
        approvalLevels: {
          orderBy: { level: "asc" },
          select: {
            level: true,
            approvedAt: true,
            rejectedAt: true,
            approvedBy: { select: { name: true, email: true } },
          },
        },
      },
    });
  },

  /** Branch, dealer mode of payment and main warehouse needed to pick ITR or SO. */
  /** Active modes of payment that have a type, as named in master data. */
  listModesOfPaymentForOrder(tenantId: string) {
    return prisma.modeOfPayment.findMany({
      where: { tenantId, recordStatus: "active", kind: { not: null } },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" },
    });
  },

  /**
   * The chosen mode of payment (active, with a type) and the branch dealer's own,
   * so an order stores an override only when it differs from the dealer's.
   */
  async findModeOfPaymentChoice(tenantId: string, branchId: string, modeOfPaymentId: string) {
    const [modeOfPayment, branch] = await Promise.all([
      prisma.modeOfPayment.findFirst({
        where: { id: modeOfPaymentId, tenantId, recordStatus: "active" },
        select: { id: true, name: true, kind: true },
      }),
      prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { dealer: { select: { modeOfPaymentId: true } } },
      }),
    ]);
    return { modeOfPayment, dealerModeOfPaymentId: branch?.dealer?.modeOfPaymentId ?? null };
  },

  /** Pass `orderId` to include that order's own mode of payment (its override of the dealer's). */
  async findSapRoutingContext(tenantId: string, branchId: string, orderId?: string) {
    const [branch, mainWarehouse, order] = await Promise.all([
      prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: {
          name: true,
          sapCode: true,
          primaryWarehouse: { select: { id: true, code: true } },
          dealer: {
            select: {
              name: true,
              sapCode: true,
              modeOfPayment: { select: { name: true, kind: true } },
            },
          },
        },
      }),
      prisma.warehouse.findFirst({
        where: { tenantId, isMain: true, deletedAt: null },
        select: { id: true, code: true },
        orderBy: { createdAt: "asc" },
      }),
      orderId
        ? prisma.branchOrder.findFirst({
            where: { id: orderId, tenantId },
            select: { modeOfPayment: { select: { name: true, kind: true } } },
          })
        : Promise.resolve(null),
    ]);
    return { branch, mainWarehouse, orderModeOfPayment: order?.modeOfPayment ?? null };
  },

  async create(
    tenantId: string,
    data: {
      branchId: string;
      orderType: BranchOrderType;
      createdById: string;
      notes?: string;
      brandId?: string | null;
      /** Override of the dealer's mode of payment; null follows the dealer. */
      modeOfPaymentId?: string | null;
      details: {
        modelId: string;
        quantity: number;
        remarks?: string | null;
        amount?: number | null;
      }[];
    },
  ) {
    const approvalChain = getOrderApprovalChain(data.orderType);
    const initialStatus = getInitialOrderStatus(data.orderType);

    for (let attempt = 0; attempt < MAX_SALES_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await prisma.$transaction(async (tx) => {
          const kind = await orderModeOfPaymentKind(tx, {
            tenantId,
            branchId: data.branchId,
            modeOfPaymentId: data.modeOfPaymentId,
          });
          const orderNumber = await nextSalesOrderNumber(tenantId, {
            db: tx,
            prefix: orderNumberPrefix(kind),
          });
          return tx.branchOrder.create({
            data: {
              tenantId,
              branchId: data.branchId,
              orderType: data.orderType,
              orderNumber,
              status: initialStatus,
              createdById: data.createdById,
              notes: data.notes,
              brandId: data.brandId ?? null,
              modeOfPaymentId: data.modeOfPaymentId ?? null,
              details: {
                create: data.details.map((line) => ({
                  modelId: line.modelId,
                  quantity: line.quantity,
                  remarks: line.remarks ?? null,
                  amount: line.amount ?? null,
                })),
              },
              approvalLevels: {
                create: approvalChain.map((step) => ({
                  level: step.level,
                  roleSlug: step.roleSlug,
                })),
              },
            },
            include: {
              branch: { select: { name: true } },
              details: { include: { model: { select: { skuCode: true } } } },
              approvalLevels: true,
            },
          });
        });
      } catch (error) {
        if (!isSalesOrderNumberConflict(error)) throw error;
      }
    }

    throw new Error(SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE);
  },

  /**
   * Replace an order's lines and restart its approval chain from the top.
   * Lines that stay on the same model keep their id so suggestion allocations survive.
   * Existing lines update quantity and amount only, so requester remarks and SP remarks stay.
   * `syncAllocations` runs inside the lock of this transaction and may reject the edit.
   */
  async updateLines(
    tenantId: string,
    orderId: string,
    data: {
      orderType: BranchOrderType;
      details: { modelId: string; quantity: number; amount?: number | null }[];
    },
    hooks?: {
      syncAllocations?: (tx: Prisma.TransactionClient) => Promise<Record<string, number>>;
    },
  ) {
    const approvalChain = getOrderApprovalChain(data.orderType);
    const initialStatus = getInitialOrderStatus(data.orderType);

    return prisma.$transaction(async (tx) => {
      const allocationQtyByDetailId = hooks?.syncAllocations
        ? await hooks.syncAllocations(tx)
        : {};

      const existing = await tx.branchOrderDetail.findMany({
        where: { orderId },
        select: { id: true, modelId: true },
      });
      const byModel = new Map<string, string>();
      const removeIds = new Set<string>();
      for (const detail of existing) {
        if (byModel.has(detail.modelId)) {
          removeIds.add(detail.id);
          continue;
        }
        byModel.set(detail.modelId, detail.id);
      }

      const nextModelIds = new Set(data.details.map((line) => line.modelId));
      for (const detail of existing) {
        if (!nextModelIds.has(detail.modelId)) removeIds.add(detail.id);
      }
      if (removeIds.size > 0) {
        await tx.branchOrderDetail.deleteMany({ where: { id: { in: [...removeIds] } } });
      }

      for (const line of data.details) {
        const detailId = byModel.get(line.modelId);
        if (detailId && !removeIds.has(detailId)) {
          await tx.branchOrderDetail.update({
            where: { id: detailId },
            data: { quantity: line.quantity, amount: line.amount ?? null },
          });
          const nextAllocated = allocationQtyByDetailId[detailId];
          if (nextAllocated != null) {
            await tx.orderSuggestionAllocation.update({
              where: { orderDetailId: detailId },
              data: { allocatedQty: nextAllocated },
            });
          }
          continue;
        }

        await tx.branchOrderDetail.create({
          data: {
            orderId,
            modelId: line.modelId,
            quantity: line.quantity,
            amount: line.amount ?? null,
          },
        });
      }

      await tx.branchOrderApprovalLevel.deleteMany({ where: { orderId } });

      return tx.branchOrder.update({
        where: { id: orderId, tenantId },
        data: {
          status: initialStatus,
          approvedById: null,
          processedAt: null,
          spaRemarks: null,
          deliveryDueDate: null,
          approvalLevels: {
            create: approvalChain.map((step) => ({
              level: step.level,
              roleSlug: step.roleSlug,
            })),
          },
        },
        include: {
          branch: { select: { name: true } },
          details: { include: { model: { select: { skuCode: true } } } },
          approvalLevels: true,
        },
      });
    });
  },

  /** Move a draft into the first approval step without changing lines. */
  async submitDraft(
    tenantId: string,
    orderId: string,
    orderType: BranchOrderType,
    hooks?: {
      beforeStatusChange?: (tx: Prisma.TransactionClient) => Promise<void>;
    },
  ) {
    const approvalChain = getOrderApprovalChain(orderType);
    const initialStatus = getInitialOrderStatus(orderType);

    return prisma.$transaction(async (tx) => {
      if (hooks?.beforeStatusChange) {
        await hooks.beforeStatusChange(tx);
      }
      await tx.branchOrderApprovalLevel.deleteMany({ where: { orderId } });

      return tx.branchOrder.update({
        where: { id: orderId, tenantId, status: "draft" },
        data: {
          status: initialStatus,
          approvedById: null,
          processedAt: null,
          spaRemarks: null,
          deliveryDueDate: null,
          approvalLevels: {
            create: approvalChain.map((step) => ({
              level: step.level,
              roleSlug: step.roleSlug,
            })),
          },
        },
        include: {
          branch: { select: { name: true } },
          details: { include: { model: { select: { skuCode: true } } } },
          approvalLevels: true,
        },
      });
    });
  },

  /** Hard-delete a draft row when it has no logistics/SAP links (race-safe predicate). */
  async deleteDraft(tenantId: string, orderId: string) {
    return prisma.branchOrder.deleteMany({
      where: {
        id: orderId,
        tenantId,
        status: "draft",
        processedAt: null,
        sapDocRef: null,
        deliveries: { none: {} },
      },
    });
  },

  findManyByIds(tenantId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.branchOrder.findMany({
      where: { tenantId, id: { in: ids } },
      include: {
        branch: { select: { name: true } },
        details: { include: { model: { select: { skuCode: true } } } },
        deliveries: { select: { id: true }, take: 1 },
      },
    });
  },

  /** Race-safe pending → cancelled when still unlinked (Super Admin bulk cancel). */
  forceCancelFromPending(
    tenantId: string,
    orderId: string,
    fromStatus: BranchOrderStatus,
  ) {
    return prisma.branchOrder.updateMany({
      where: {
        id: orderId,
        tenantId,
        status: fromStatus,
        processedAt: null,
        sapDocRef: null,
        deliveries: { none: {} },
      },
      data: { status: "cancelled" },
    });
  },

  updateStatus(
    tenantId: string,
    id: string,
    status: BranchOrderStatus,
    extra?: { approvedById?: string },
  ) {
    return prisma.branchOrder.update({
      where: { id, tenantId },
      data: { status, ...(extra?.approvedById ? { approvedById: extra.approvedById } : {}) },
    });
  },

  addApproval(
    orderId: string,
    data: { level: number; roleSlug: string; approvedById: string; comment?: string },
  ) {
    return prisma.branchOrderApprovalLevel.update({
      where: { orderId_level: { orderId, level: data.level } },
      data: {
        approvedAt: new Date(),
        approvedById: data.approvedById,
        comment: data.comment ?? null,
      },
    });
  },

  addRejection(
    orderId: string,
    data: { level: number; roleSlug: string; approvedById: string; comment?: string },
  ) {
    return prisma.branchOrderApprovalLevel.update({
      where: { orderId_level: { orderId, level: data.level } },
      data: {
        rejectedAt: new Date(),
        approvedById: data.approvedById,
        comment: data.comment ?? null,
      },
    });
  },

  countPendingByStatus(tenantId: string, statuses: BranchOrderStatus[]) {
    return prisma.branchOrder.count({
      where: { tenantId, status: { in: statuses } },
    });
  },

  /**
   * Final approval in one transaction: level, quantities, SP remarks, snapshot,
   * status, overall remarks, and delivery due date. SAP emission stays outside.
   */
  async finalizeApproved(
    tenantId: string,
    orderId: string,
    data: {
      fromStatus: BranchOrderStatus;
      expectedUpdatedAt?: Date;
      level: number;
      approvedById: string;
      comment?: string;
      spaRemarks?: string;
      deliveryDueDate?: Date;
      brandId?: string | null;
      sapDocType?: SapOrderDocType;
      reviewSnapshot?: Prisma.InputJsonValue | null;
      lines: {
        detailId: string;
        approvedQty: number;
        spRemarks?: string | null;
      }[];
    },
  ) {
    const processedAt = new Date();
    const reviewSnapshot = data.reviewSnapshot;

    await prisma.$transaction(async (tx) => {
      const approved = await tx.branchOrder.updateMany({
        where: {
          id: orderId,
          tenantId,
          status: data.fromStatus,
          ...(data.expectedUpdatedAt ? { updatedAt: data.expectedUpdatedAt } : {}),
        },
        data: {
          status: "approved",
          processedAt,
          spaRemarks: data.spaRemarks ?? null,
          deliveryDueDate: data.deliveryDueDate ?? null,
          ...(reviewSnapshot != null
            ? {
                reviewSnapshot,
                reviewSnapshotAt: processedAt,
              }
            : {}),
        },
      });
      if (approved.count !== 1) {
        throw new Error(ORDER_CHANGED_MESSAGE);
      }

      await tx.branchOrder.update({
        where: { id: orderId },
        data: {
          approvedById: data.approvedById,
          brandId: data.brandId ?? null,
          ...(data.sapDocType ? { sapDocType: data.sapDocType } : {}),
        },
      });

      for (const line of data.lines) {
        const lineData: Prisma.BranchOrderDetailUpdateManyMutationInput = {
          approvedQty: line.approvedQty,
        };
        if (line.spRemarks !== undefined) {
          lineData.spRemarks = line.spRemarks;
        }
        const updated = await tx.branchOrderDetail.updateMany({
          where: { id: line.detailId, orderId },
          data: lineData,
        });
        if (updated.count !== 1) {
          throw new Error("One or more lines do not belong to this order.");
        }
      }

      await tx.branchOrderApprovalLevel.update({
        where: { orderId_level: { orderId, level: data.level } },
        data: {
          approvedAt: processedAt,
          approvedById: data.approvedById,
          comment: data.comment ?? null,
        },
      });
    });
  },

  /**
   * SAP refused the document after final approval was saved. The order goes
   * back to Pending Supply Planning. The SO#, lines, approved quantities, and
   * SP remarks stay so the same order can be approved again.
   */
  async revertSupplyPlanningApproval(
    tenantId: string,
    orderId: string,
    level: number,
  ): Promise<{ updatedAt: Date }> {
    return prisma.$transaction(async (tx) => {
      const reverted = await tx.branchOrder.updateMany({
        where: { id: orderId, tenantId, status: "approved" },
        data: {
          status: "pending_sp",
          processedAt: null,
          approvedById: null,
        },
      });
      if (reverted.count !== 1) {
        throw new Error("This order could not be returned to Pending Supply Planning.");
      }

      await tx.branchOrderApprovalLevel.update({
        where: { orderId_level: { orderId, level } },
        data: {
          approvedAt: null,
          approvedById: null,
        },
      });

      const row = await tx.branchOrder.findFirst({
        where: { id: orderId, tenantId },
        select: { updatedAt: true },
      });
      if (!row) {
        throw new Error("This order could not be returned to Pending Supply Planning.");
      }
      return { updatedAt: row.updatedAt };
    });
  },
};
