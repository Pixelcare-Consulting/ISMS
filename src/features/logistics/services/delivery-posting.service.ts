import { Prisma } from "@/lib/database/generated/prisma/client";

import { prisma } from "@/lib/database/client";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  assertExclusiveClaim,
  planAccept,
  planDispatch,
  planReject,
  type BranchUnitStatus,
  type DeliveryPostingView,
  type WarehouseHold,
} from "@/features/logistics/services/delivery-posting.planner";

/**
 * ISMS warehouse and branch movements for a delivery.
 *
 * Process II ends when Supply Planning approves: the approved_order job is the
 * stand-in for SAP "Auto Create ITR/SO" and only stores a document reference.
 * It does not move stock. These posts run later, in one transaction each:
 * dispatch (warehouse → DIT), accept (DIT → STK), and reject-after-dispatch
 * (unaccepted DIT back to the warehouse location stored on the line).
 */

async function workflowCodeId(
  tenantId: string,
  code: "approved" | "pending" | "accepted" | "rejected" | "partial",
) {
  return reasonStatusService.requireCodeId(tenantId, "delivery_workflow", code);
}

async function inventoryCodeId(tenantId: string, code: "DIT" | "STK") {
  return reasonStatusService.requireCodeId(tenantId, "inventory_system", code);
}

function claimError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("One or more serials are missing, already allocated, or not in that warehouse");
  }
  return error instanceof Error ? error : new Error("Delivery posting failed");
}

function asBranchStatus(code: string | null | undefined): BranchUnitStatus | null {
  if (code === "DIT" || code === "STK" || code === "SLD" || code === "DEF") return code;
  if (!code) return null;
  return "OTHER";
}

async function loadDelivery(tenantId: string, deliveryId: string): Promise<DeliveryPostingView | null> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    include: {
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true, warehouseLocationFromId: true } },
      order: {
        select: {
          details: { select: { modelId: true, quantity: true, approvedQty: true } },
        },
      },
    },
  });
  if (!delivery) return null;

  const lineSerialIds = delivery.lines.map((line) => line.serialNumberId);
  const branchUnits = lineSerialIds.length
    ? await prisma.branchInventory.findMany({
        where: {
          tenantId,
          branchId: delivery.branchId,
          serialNumberId: { in: lineSerialIds },
        },
        select: { serialNumberId: true, statusCode: { select: { code: true } } },
      })
    : [];
  const statusBySerial = new Map(branchUnits.map((row) => [row.serialNumberId, row.statusCode.code]));

  const requirements = (delivery.order?.details ?? [])
    .map((detail) => ({
      modelId: detail.modelId,
      quantity: detail.approvedQty ?? detail.quantity,
    }))
    .filter((detail) => detail.quantity > 0);

  const status = delivery.statusCode.code;
  const known: DeliveryPostingView["status"] =
    status === "approved" ||
    status === "pending" ||
    status === "accepted" ||
    status === "rejected" ||
    status === "partial" ||
    status === "requested"
      ? status
      : "requested";

  return {
    id: delivery.id,
    branchId: delivery.branchId,
    status: known,
    lines: delivery.lines.map((line) => ({
      serialNumberId: line.serialNumberId,
      warehouseLocationFromId: line.warehouseLocationFromId,
      branchStatus: asBranchStatus(statusBySerial.get(line.serialNumberId)),
    })),
    requirements,
  };
}

async function loadHolds(tenantId: string, serialNumberIds: string[]): Promise<WarehouseHold[]> {
  if (serialNumberIds.length === 0) return [];
  const rows = await prisma.warehouseInventory.findMany({
    where: { tenantId, serialNumberId: { in: serialNumberIds } },
    select: {
      serialNumberId: true,
      warehouseLocationId: true,
      warehouseLocation: { select: { warehouseId: true } },
      serialNumber: { select: { modelId: true } },
    },
  });
  return rows.map((row) => ({
    serialNumberId: row.serialNumberId,
    modelId: row.serialNumber.modelId,
    warehouseId: row.warehouseLocation.warehouseId,
    warehouseLocationId: row.warehouseLocationId,
  }));
}

export interface DispatchCandidate {
  id: string;
  serialNo: string;
  modelId: string;
  warehouseCode: string;
  locationCode: string;
}

export const deliveryPostingService = {
  async listDispatchCandidates(tenantId: string, deliveryId: string): Promise<{
    requiredQty: number;
    serials: DispatchCandidate[];
  }> {
    const delivery = await loadDelivery(tenantId, deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    if (delivery.status !== "approved") {
      throw new Error("Only an approved delivery can be dispatched");
    }
    const modelIds = delivery.requirements.map((row) => row.modelId);
    const requiredQty = delivery.requirements.reduce((sum, row) => sum + row.quantity, 0);
    if (modelIds.length === 0) {
      return { requiredQty: 0, serials: [] };
    }

    const branch = await prisma.branch.findFirst({
      where: { id: delivery.branchId, tenantId },
      select: { primaryWarehouseId: true },
    });

    const rows = await prisma.warehouseInventory.findMany({
      where: {
        tenantId,
        serialNumber: { modelId: { in: modelIds }, deletedAt: null },
        ...(branch?.primaryWarehouseId
          ? { warehouseLocation: { warehouseId: branch.primaryWarehouseId } }
          : {}),
      },
      select: {
        serialNumberId: true,
        serialNumber: { select: { serialNo: true, modelId: true } },
        warehouseLocation: {
          select: { code: true, warehouse: { select: { code: true } } },
        },
      },
      orderBy: { serialNumber: { serialNo: "asc" } },
    });

    return {
      requiredQty,
      serials: rows.map((row) => ({
        id: row.serialNumberId,
        serialNo: row.serialNumber.serialNo,
        modelId: row.serialNumber.modelId,
        warehouseCode: row.warehouseLocation.warehouse.code,
        locationCode: row.warehouseLocation.code,
      })),
    };
  },

  async dispatch(input: {
    tenantId: string;
    userId: string;
    deliveryId: string;
    serialNumberIds: string[];
  }): Promise<{ movedCount: number }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    const holds = await loadHolds(input.tenantId, input.serialNumberIds);
    const plan = planDispatch(preview, holds, input.serialNumberIds);
    if (!plan.ok) throw new Error(plan.error);

    const branch = await prisma.branch.findFirst({
      where: { id: preview.branchId, tenantId: input.tenantId },
      select: { primaryWarehouseId: true, name: true },
    });
    if (branch?.primaryWarehouseId && plan.warehouseId !== branch.primaryWarehouseId) {
      throw new Error("One or more serials are missing, already allocated, or not in that warehouse");
    }

    const [pendingCodeId, ditCodeId] = await Promise.all([
      workflowCodeId(input.tenantId, "pending"),
      inventoryCodeId(input.tenantId, "DIT"),
    ]);
    const approvedCodeId = await workflowCodeId(input.tenantId, "approved");

    try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.branchDelivery.updateMany({
        where: { id: input.deliveryId, tenantId: input.tenantId, statusCodeId: approvedCodeId },
        data: { statusCodeId: pendingCodeId },
      });
      assertExclusiveClaim(
        claimed.count,
        1,
        "This delivery has already been dispatched",
      );

      const removed = await tx.warehouseInventory.deleteMany({
        where: {
          tenantId: input.tenantId,
          serialNumberId: { in: plan.moves.map((move) => move.serialNumberId) },
          warehouseLocation: { warehouseId: plan.warehouseId },
        },
      });
      assertExclusiveClaim(
        removed.count,
        plan.moves.length,
        "One or more serials are missing, already allocated, or not in that warehouse",
      );

      await tx.branchInventory.createMany({
        data: plan.moves.map((move) => ({
          tenantId: input.tenantId,
          branchId: preview.branchId,
          serialNumberId: move.serialNumberId,
          statusCodeId: ditCodeId,
          updatedById: input.userId,
        })),
      });

      await tx.branchDeliveryLine.createMany({
        data: plan.moves.map((move) => ({
          deliveryId: input.deliveryId,
          serialNumberId: move.serialNumberId,
          warehouseLocationFromId: move.warehouseLocationId,
        })),
      });

      const header = await tx.branchDelivery.findFirst({
        where: { id: input.deliveryId, tenantId: input.tenantId },
        select: { deliveryNo: true },
      });

      await tx.serialNumberHistory.createMany({
        data: plan.moves.map((move) => ({
          tenantId: input.tenantId,
          serialNumberId: move.serialNumberId,
          txnType: "delivery" as const,
          details: `Dispatched on ${header?.deliveryNo ?? input.deliveryId} to ${branch?.name ?? "the branch"}`,
          status: "DIT",
          createdById: input.userId,
        })),
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "delivery.dispatched",
          entityType: "BranchDelivery",
          entityId: input.deliveryId,
          metadata: {
            movedCount: plan.moves.length,
            serialNumberIds: plan.moves.map((move) => move.serialNumberId),
          },
        },
      });
    });
    } catch (error) {
      throw claimError(error);
    }

    return { movedCount: plan.moves.length };
  },

  async accept(input: {
    tenantId: string;
    userId: string;
    deliveryId: string;
    serialNumberIds?: string[];
  }): Promise<{ movedCount: number; idempotent: boolean; status: "accepted" | "partial" }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    const plan = planAccept(preview, input.serialNumberIds ?? null);
    if (!plan.ok) throw new Error(plan.error);

    if (plan.idempotent && plan.moveSerialIds.length === 0 && preview.status === plan.nextStatus) {
      return { movedCount: plan.movedCount, idempotent: true, status: plan.nextStatus };
    }

    const [nextCodeId, ditCodeId, stkCodeId] = await Promise.all([
      workflowCodeId(input.tenantId, plan.nextStatus),
      inventoryCodeId(input.tenantId, "DIT"),
      inventoryCodeId(input.tenantId, "STK"),
    ]);
    const fromCodes = await Promise.all(
      (preview.status === "partial" ? (["partial"] as const) : (["pending", "partial"] as const)).map((code) =>
        workflowCodeId(input.tenantId, code),
      ),
    );

    try {
    await prisma.$transaction(async (tx) => {
      if (plan.moveSerialIds.length > 0) {
        const moved = await tx.branchInventory.updateMany({
          where: {
            tenantId: input.tenantId,
            branchId: preview.branchId,
            statusCodeId: ditCodeId,
            serialNumberId: { in: plan.moveSerialIds },
          },
          data: { statusCodeId: stkCodeId, updatedById: input.userId },
        });
        assertExclusiveClaim(
          moved.count,
          plan.moveSerialIds.length,
          "Some serials are not in-transit at this branch",
        );
      }

      const claimed = await tx.branchDelivery.updateMany({
        where: {
          id: input.deliveryId,
          tenantId: input.tenantId,
          statusCodeId: { in: fromCodes },
        },
        data: {
          statusCodeId: nextCodeId,
          ...(plan.nextStatus === "accepted" ? { acceptedAt: new Date() } : {}),
        },
      });
      assertExclusiveClaim(claimed.count, 1, "Delivery could not be accepted");

      if (plan.moveSerialIds.length > 0) {
        const header = await tx.branchDelivery.findFirst({
          where: { id: input.deliveryId, tenantId: input.tenantId },
          select: { deliveryNo: true, branch: { select: { name: true } } },
        });
        await tx.serialNumberHistory.createMany({
          data: plan.moveSerialIds.map((serialNumberId) => ({
            tenantId: input.tenantId,
            serialNumberId,
            txnType: "inv_acknowledgement" as const,
            details: `Accepted on ${header?.deliveryNo ?? input.deliveryId} at ${header?.branch.name ?? "the branch"}`,
            status: "STK",
            createdById: input.userId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "delivery.accepted",
          entityType: "BranchDelivery",
          entityId: input.deliveryId,
          metadata: {
            movedCount: plan.moveSerialIds.length,
            status: plan.nextStatus,
            idempotent: plan.idempotent,
          },
        },
      });
    });
    } catch (error) {
      throw claimError(error);
    }

    return {
      movedCount: plan.moveSerialIds.length,
      idempotent: plan.idempotent,
      status: plan.nextStatus,
    };
  },

  async reject(input: {
    tenantId: string;
    userId: string;
    deliveryId: string;
    notes?: string;
  }): Promise<{ returnedCount: number; idempotent: boolean }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    const plan = planReject(preview);
    if (!plan.ok) throw new Error(plan.error);
    if (plan.idempotent) {
      return { returnedCount: 0, idempotent: true };
    }

    const rejectedCodeId = await workflowCodeId(input.tenantId, "rejected");
    const ditCodeId = await inventoryCodeId(input.tenantId, "DIT");
    const currentCode =
      preview.status === "pending" || preview.status === "partial" || preview.status === "approved"
        ? preview.status
        : "requested";
    const currentCodeId = await reasonStatusService.requireCodeId(
      input.tenantId,
      "delivery_workflow",
      currentCode,
    );

    try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.branchDelivery.updateMany({
        where: {
          id: input.deliveryId,
          tenantId: input.tenantId,
          statusCodeId: currentCodeId,
        },
        data: { statusCodeId: rejectedCodeId },
      });
      assertExclusiveClaim(claimed.count, 1, "Delivery could not be rejected");

      if (plan.returns.length > 0) {
        const removed = await tx.branchInventory.deleteMany({
          where: {
            tenantId: input.tenantId,
            branchId: preview.branchId,
            statusCodeId: ditCodeId,
            serialNumberId: { in: plan.returns.map((row) => row.serialNumberId) },
          },
        });
        assertExclusiveClaim(
          removed.count,
          plan.returns.length,
          "In-transit serials could not be returned to the warehouse",
        );

        await tx.warehouseInventory.createMany({
          data: plan.returns.map((row) => ({
            tenantId: input.tenantId,
            serialNumberId: row.serialNumberId,
            warehouseLocationId: row.warehouseLocationId,
            systemStatus: "Returned from delivery",
            systemUpdatedAt: new Date(),
          })),
        });

        const header = await tx.branchDelivery.findFirst({
          where: { id: input.deliveryId, tenantId: input.tenantId },
          select: { deliveryNo: true },
        });
        await tx.serialNumberHistory.createMany({
          data: plan.returns.map((row) => ({
            tenantId: input.tenantId,
            serialNumberId: row.serialNumberId,
            txnType: "delivery" as const,
            details: `Returned to warehouse from ${header?.deliveryNo ?? input.deliveryId}`,
            status: "Warehouse",
            createdById: input.userId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "delivery.rejected",
          entityType: "BranchDelivery",
          entityId: input.deliveryId,
          metadata: {
            returnedCount: plan.returns.length,
            ...(input.notes ? { notes: input.notes } : {}),
          },
        },
      });
    });
    } catch (error) {
      throw claimError(error);
    }

    return { returnedCount: plan.returns.length, idempotent: false };
  },
};
