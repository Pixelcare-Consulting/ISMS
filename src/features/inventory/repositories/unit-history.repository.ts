import type {
  DeliveryReturnStatus,
  DeliveryTransferLineStatus,
  ReturnActionType,
} from "@prisma/client";

import {
  UNIT_HISTORY_LIMIT,
  type UnitHistoryActor,
  type UnitHistorySnapshot,
} from "@/features/inventory/lib/unit-history-events";
import { returnRequestAppliesToLine } from "@/features/sales/constants/return-history-status";
import { prisma } from "@/lib/database/client";

const actorSelect = {
  select: {
    name: true,
    email: true,
    userRoles: { select: { role: { select: { slug: true } } } },
  },
} as const;

type ActorRow = {
  name: string | null;
  email: string;
  userRoles: { role: { slug: string } }[];
};

function toActor(user: ActorRow | null | undefined): UnitHistoryActor | null {
  if (!user) return null;
  return {
    name: user.name,
    email: user.email,
    roleSlugs: user.userRoles.map((membership) => membership.role.slug),
  };
}

type LevelRow = {
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
};

function toLevel(level: LevelRow, actors: ReadonlyMap<string, UnitHistoryActor>) {
  return {
    approvedAt: level.approvedAt,
    approvedBy: level.approvedById ? (actors.get(level.approvedById) ?? null) : null,
    rejectedAt: level.rejectedAt,
    rejectedBy: level.rejectedById ? (actors.get(level.rejectedById) ?? null) : null,
  };
}

function returnAction(actionType: ReturnActionType | null): "return" | "replacement" {
  switch (actionType) {
    case null:
    case "return":
      return "return";
    case "replacement":
      return "replacement";
    default: {
      const unexpected: never = actionType;
      return unexpected;
    }
  }
}

function deliveryTransferStatus(
  status: DeliveryTransferLineStatus,
): UnitHistorySnapshot["deliveryTransfers"][number]["lineStatus"] {
  switch (status) {
    case "PENDING":
    case "APPROVED":
    case "REMOVED":
    case "RECEIVED":
      return status;
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function deliveryReturnStatus(
  status: DeliveryReturnStatus,
): UnitHistorySnapshot["deliveryReturns"][number]["status"] {
  switch (status) {
    case "PENDING_APPROVAL":
    case "APPROVED":
    case "COMPLETED":
    case "CANCELLED":
      return status;
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

/**
 * One serial, only when that unit sits on a branch in the caller's inventory scope.
 * Does not load the serial traceability page.
 */
export const unitHistoryRepository = {
  async load(
    tenantId: string,
    serialNumberId: string,
    branchIds: string[] | null,
  ): Promise<UnitHistorySnapshot | null> {
    const placement = await prisma.branchInventory.findFirst({
      where: {
        tenantId,
        serialNumberId,
        ...(branchIds ? { branchId: { in: branchIds } } : {}),
      },
      select: {
        id: true,
        updatedAt: true,
        statusUpdatedAt: true,
        statusCode: { select: { name: true } },
        updatedBy: actorSelect,
      },
    });
    if (!placement) return null;

    const [
      statusChanges,
      deliveries,
      transfers,
      deliveryTransfers,
      pullouts,
      sales,
      deliveryReturns,
      stockCounts,
    ] = await Promise.all([
      prisma.serialNumberHistory.findMany({
        where: {
          tenantId,
          serialNumberId,
          txnType: { in: ["inv_status_update", "defect"] },
        },
        orderBy: { createdAt: "desc" },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          createdAt: true,
          details: true,
          status: true,
          createdBy: actorSelect,
        },
      }),
      prisma.branchDeliveryLine.findMany({
        where: { serialNumberId, delivery: { tenantId } },
        orderBy: { delivery: { createdAt: "desc" } },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          delivery: {
            select: {
              createdAt: true,
              acceptedAt: true,
              statusCode: { select: { name: true } },
              scheduledBy: actorSelect,
            },
          },
        },
      }),
      prisma.branchTransferLine.findMany({
        where: { serialNumberId, transfer: { tenantId } },
        orderBy: { transfer: { createdAt: "desc" } },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          decision: true,
          decidedAt: true,
          decidedBy: actorSelect,
          transfer: {
            select: {
              createdAt: true,
              createdBy: actorSelect,
              approvalLevels: {
                orderBy: { level: "asc" },
                select: {
                  approvedAt: true,
                  approvedById: true,
                  rejectedAt: true,
                  rejectedById: true,
                },
              },
            },
          },
        },
      }),
      prisma.deliveryTransferLine.findMany({
        where: { serialNumberId, transfer: { tenantId } },
        orderBy: { transfer: { createdAt: "desc" } },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          status: true,
          decidedAt: true,
          decidedBy: actorSelect,
          transfer: {
            select: {
              createdAt: true,
              createdBy: actorSelect,
            },
          },
        },
      }),
      prisma.branchPulloutLine.findMany({
        where: { serialNumberId, pullout: { tenantId } },
        orderBy: { pullout: { createdAt: "desc" } },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          decision: true,
          decidedAt: true,
          decidedBy: actorSelect,
          rejectedAt: true,
          rejectedBy: actorSelect,
          pullout: {
            select: {
              createdAt: true,
              createdBy: actorSelect,
              approvalLevels: {
                orderBy: { level: "asc" },
                select: {
                  approvedAt: true,
                  approvedById: true,
                  rejectedAt: true,
                  rejectedById: true,
                },
              },
            },
          },
        },
      }),
      prisma.branchSalesTransactionDetail.findMany({
        where: { serialNumberId, sale: { tenantId } },
        orderBy: { createdAt: "desc" },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          sale: {
            select: {
              transactionDate: true,
              createdAt: true,
              createdBy: actorSelect,
              returnRequest: {
                select: {
                  id: true,
                  saleDetailId: true,
                  actionType: true,
                  createdAt: true,
                  approvedAt: true,
                  requestedBy: actorSelect,
                  approvedBy: actorSelect,
                },
              },
            },
          },
        },
      }),
      prisma.deliveryReturnLine.findMany({
        where: { serialNumberId, returnRequest: { tenantId } },
        orderBy: { returnRequest: { requestedAt: "desc" } },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          returnRequest: {
            select: {
              status: true,
              requestedAt: true,
              decidedAt: true,
              requestedBy: actorSelect,
              decidedBy: actorSelect,
            },
          },
        },
      }),
      prisma.stockCountLine.findMany({
        where: { serialNumberId, session: { tenantId } },
        orderBy: { countedAt: "desc" },
        take: UNIT_HISTORY_LIMIT,
        select: {
          id: true,
          countedAt: true,
          countedBy: actorSelect,
          session: {
            select: {
              createdAt: true,
              createdBy: actorSelect,
            },
          },
        },
      }),
    ]);

    const actorIds = new Set<string>();
    for (const row of transfers) {
      for (const level of row.transfer.approvalLevels) {
        if (level.approvedById) actorIds.add(level.approvedById);
        if (level.rejectedById) actorIds.add(level.rejectedById);
      }
    }
    for (const row of pullouts) {
      for (const level of row.pullout.approvalLevels) {
        if (level.approvedById) actorIds.add(level.approvedById);
        if (level.rejectedById) actorIds.add(level.rejectedById);
      }
    }

    const actorRows =
      actorIds.size === 0
        ? []
        : await prisma.user.findMany({
            where: { tenantId, id: { in: [...actorIds] } },
            select: { id: true, name: true, email: true, userRoles: actorSelect.select.userRoles },
          });
    const actors = new Map<string, UnitHistoryActor>();
    for (const row of actorRows) {
      const actor = toActor(row);
      if (actor) actors.set(row.id, actor);
    }

    return {
      placement: {
        id: placement.id,
        at: placement.statusUpdatedAt ?? placement.updatedAt,
        statusName: placement.statusCode.name,
        actor: toActor(placement.updatedBy),
      },
      statusChanges: statusChanges.map((row) => ({
        id: row.id,
        at: row.createdAt,
        details: row.details,
        status: row.status,
        actor: toActor(row.createdBy),
      })),
      deliveries: deliveries.map((row) => ({
        id: row.id,
        at: row.delivery.acceptedAt ?? row.delivery.createdAt,
        statusName: row.delivery.statusCode.name,
        actor: toActor(row.delivery.scheduledBy),
      })),
      transfers: transfers.map((row) => ({
        id: row.id,
        requestedAt: row.transfer.createdAt,
        requestedBy: toActor(row.transfer.createdBy),
        approvals: row.transfer.approvalLevels.map((level) => toLevel(level, actors)),
        decision: row.decision,
        decidedAt: row.decidedAt,
        decidedBy: toActor(row.decidedBy),
      })),
      deliveryTransfers: deliveryTransfers.map((row) => ({
        id: row.id,
        requestedAt: row.transfer.createdAt,
        requestedBy: toActor(row.transfer.createdBy),
        lineStatus: deliveryTransferStatus(row.status),
        decidedAt: row.decidedAt,
        decidedBy: toActor(row.decidedBy),
      })),
      pullouts: pullouts.map((row) => ({
        id: row.id,
        requestedAt: row.pullout.createdAt,
        requestedBy: toActor(row.pullout.createdBy),
        approvals: row.pullout.approvalLevels.map((level) => toLevel(level, actors)),
        decision: row.decision,
        decidedAt: row.decidedAt,
        decidedBy: toActor(row.decidedBy),
        rejectedAt: row.rejectedAt,
        rejectedBy: toActor(row.rejectedBy),
      })),
      sales: sales.map((row) => ({
        id: row.id,
        at: row.sale.transactionDate ?? row.sale.createdAt,
        actor: toActor(row.sale.createdBy),
      })),
      returns: sales.flatMap((row) => {
        const request = row.sale.returnRequest;
        if (!request || !returnRequestAppliesToLine(request.saleDetailId, row.id)) return [];
        return [
          {
            id: request.id,
            action: returnAction(request.actionType),
            requestedAt: request.createdAt,
            requestedBy: toActor(request.requestedBy),
            approvedAt: request.approvedAt,
            approvedBy: toActor(request.approvedBy),
          },
        ];
      }),
      deliveryReturns: deliveryReturns.map((row) => ({
        id: row.id,
        status: deliveryReturnStatus(row.returnRequest.status),
        requestedAt: row.returnRequest.requestedAt,
        requestedBy: toActor(row.returnRequest.requestedBy),
        decidedAt: row.returnRequest.decidedAt,
        decidedBy: toActor(row.returnRequest.decidedBy),
      })),
      stockCounts: stockCounts.map((row) => ({
        id: row.id,
        at: row.countedAt ?? row.session.createdAt,
        actor: toActor(row.countedBy ?? row.session.createdBy),
      })),
    };
  },
};
