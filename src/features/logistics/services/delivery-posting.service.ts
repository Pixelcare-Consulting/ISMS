import type { DeliveryReturnStatus, SapOrderDocType } from "@prisma/client";
import { Prisma } from "@/lib/database/generated/prisma/client";

import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { prisma } from "@/lib/database/client";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  asWorkflowCode,
  DELIVERY_WORKFLOW_CODE,
  type DeliveryWorkflowCodeKey,
} from "@/features/logistics/constants/workflow-codes";
import {
  assertExclusiveClaim,
  planAccept,
  planDeliverySettle,
  receiptLineState,
  RETURN_WAITING_ERROR,
  type BranchUnitStatus,
  type DeliveryPostingView,
  type DeliveryReceiptLineState,
} from "@/features/logistics/services/delivery-posting.planner";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import {
  assertNotOnOpenTransfer,
  findOpenTransferLines,
} from "@/features/logistics/services/delivery-transfer-open-lines";
import {
  hasOpenReturn,
  lockDeliveryRow,
  txWorkflowCodeId,
} from "@/features/logistics/services/delivery-settle";
import type { LogisticsShipment } from "@/features/logistics/lib/shipment";
import type { PostingActor, PostingDb } from "@/features/logistics/services/posting-support";

/**
 * ISMS warehouse and branch movements for a delivery.
 *
 * Process II ends when Supply Planning approves: the approved_order job posts
 * the live SAP ITR (OWTQ, consignment) or SO (ORDR, outright) and opens the
 * local BranchDelivery (Process III.A entry). Dispatch happens in SAP: a SAP user
 * copies that document to an IT or DR, and the cron follow-up
 * (sap-copy-to-follow.service) moves its serials to DIT. Accept moves DIT → STK per
 * unit, and units not accepted go on a unit transfer. In-transit units go back
 * through a return request (delivery-return.service), which posts SAP first.
 */

async function workflowCodeId(tenantId: string, code: DeliveryWorkflowCodeKey) {
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

export type LoadedDelivery = DeliveryPostingView & {
  sapDocEntry: number | null;
  drNo: string | null;
  /** SAP document type stored on the order at approval; null on orders approved before SAP posting. */
  orderSapDocType: SapOrderDocType | null;
};

export async function loadDelivery(tenantId: string, deliveryId: string): Promise<LoadedDelivery | null> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    include: {
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true, warehouseLocationFromId: true } },
      order: {
        select: {
          sapDocType: true,
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
  const known =
    asWorkflowCode(DELIVERY_WORKFLOW_CODE, status) ??
    DELIVERY_WORKFLOW_CODE.requested;

  return {
    id: delivery.id,
    branchId: delivery.branchId,
    sourceWarehouseId: delivery.sourceWarehouseId,
    sapDocEntry: delivery.sapDocEntry,
    drNo: delivery.drNo,
    orderSapDocType: delivery.order?.sapDocType ?? null,
    status: known,
    lines: delivery.lines.map((line) => ({
      serialNumberId: line.serialNumberId,
      warehouseLocationFromId: line.warehouseLocationFromId,
      branchStatus: asBranchStatus(statusBySerial.get(line.serialNumberId)),
    })),
    requirements,
  };
}

export interface DeliveryReceiptLine {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  /** Still DIT at the delivery branch, so it can be accepted or returned. */
  inTransit: boolean;
  /** Held by a pending or approved unit transfer: not acceptable here. */
  openTransfer: { id: string; transferNo: string } | null;
  /** Group in the receive dialog; TRANSFERRED units left on one of this delivery's unit transfers. */
  state: DeliveryReceiptLineState;
}

/**
 * Re-derives the delivery status after units left it by another route (unit
 * transfer receive, return). Runs inside the caller's transaction. Returns the
 * new status, or null when it did not change.
 */
export async function finalizeDeliveryIfSettled(
  tx: PostingDb,
  tenantId: string,
  deliveryId: string,
): Promise<"accepted" | "partial" | null> {
  // Serialises concurrent settles (two transfer receives, or a receive and an accept).
  await lockDeliveryRow(tx, tenantId, deliveryId);
  const delivery = await tx.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    select: {
      branchId: true,
      acceptedAt: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true } },
    },
  });
  if (!delivery) return null;
  const current = delivery.statusCode.code;
  if (current !== "pending" && current !== "partial") return null;

  const stillInTransit = delivery.lines.length
    ? await tx.branchInventory.count({
        where: {
          tenantId,
          branchId: delivery.branchId,
          serialNumberId: { in: delivery.lines.map((line) => line.serialNumberId) },
          statusCode: { code: "DIT" },
        },
      })
    : 0;
  const next = planDeliverySettle({ totalLines: delivery.lines.length, stillInTransit });
  if (!next || next === current) return null;

  const nextCodeId = await txWorkflowCodeId(tx, tenantId, next);
  const claimed = await tx.branchDelivery.updateMany({
    where: { id: deliveryId, tenantId, statusCodeId: delivery.statusCodeId },
    data: {
      statusCodeId: nextCodeId,
      ...(next === "accepted" && !delivery.acceptedAt ? { acceptedAt: new Date() } : {}),
    },
  });
  assertExclusiveClaim(claimed.count, 1, "This delivery was updated by someone else");
  return next;
}

export interface DeliveryDetail {
  id: string;
  deliveryNo: string;
  drNo: string | null;
  drDate: string | null;
  shipment: LogisticsShipment;
  status: { code: string; name: string; color: string | null };
  branch: { name: string };
  order: {
    orderNumber: string;
    /** The ITR / SO ISMS posted at approval, that SAP users Copy To an IT / DR. */
    sapDocType: SapOrderDocType | null;
    sapDocNum: number | null;
  } | null;
  /** ITs / DRs the cron follow-up found for this delivery, newest first. */
  sapDocuments: {
    docKind: string;
    displayNo: string;
    docDate: string | null;
    status: string;
    serialCount: number;
    error: string | null;
  }[];
  /** Approved order lines. Shown when the delivery has no serials yet. */
  orderLines: { id: string; skuCode: string; modelName: string; quantity: number }[];
  serials: { serialNumberId: string; serialNo: string; skuCode: string; modelName: string }[];
  latestReturn: {
    id: string;
    requestNo: string;
    status: DeliveryReturnStatus;
    sapError: string | null;
  } | null;
  history: { id: string; action: string; at: string; userName: string | null }[];
}

export const deliveryPostingService = {
  /** Header, approved lines or serials, and audit history for the delivery page. */
  async getDetail(actor: PostingActor, deliveryId: string): Promise<DeliveryDetail> {
    const delivery = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: {
        id: true,
        deliveryNo: true,
        drNo: true,
        drDate: true,
        waybillNo: true,
        courierName: true,
        scheduledAt: true,
        scheduledBy: { select: { name: true } },
        branchId: true,
        sourceWarehouseId: true,
        branch: { select: { name: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        order: {
          select: {
            orderNumber: true,
            sapDocType: true,
            sapDocNum: true,
            details: {
              select: {
                id: true,
                quantity: true,
                approvedQty: true,
                model: { select: { skuCode: true, name: true } },
              },
              orderBy: { model: { skuCode: "asc" } },
            },
          },
        },
        lines: {
          select: {
            serialNumberId: true,
            serialNumber: {
              select: {
                serialNo: true,
                model: { select: { skuCode: true, name: true } },
              },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
        returnRequests: {
          orderBy: { requestedAt: "desc" },
          take: 1,
          select: { id: true, requestNo: true, status: true, sapError: true },
        },
        sapDocuments: {
          orderBy: { docEntry: "desc" },
          select: {
            docKind: true,
            displayNo: true,
            docDate: true,
            status: true,
            serialCount: true,
            error: true,
          },
        },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, {
      branchId: delivery.branchId,
      sourceWarehouseId: delivery.sourceWarehouseId,
    });

    const history = await prisma.auditLog.findMany({
      where: { tenantId: actor.tenantId, entityType: "BranchDelivery", entityId: delivery.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    });

    const orderLines = (delivery.order?.details ?? []).flatMap((detail) => {
      const quantity = detail.approvedQty ?? detail.quantity;
      if (quantity <= 0) return [];
      return [
        {
          id: detail.id,
          skuCode: detail.model.skuCode,
          modelName: detail.model.name,
          quantity,
        },
      ];
    });

    return {
      id: delivery.id,
      deliveryNo: delivery.deliveryNo,
      drNo: delivery.drNo,
      drDate: delivery.drDate ? delivery.drDate.toISOString() : null,
      shipment: {
        waybillNo: delivery.waybillNo,
        courierName: delivery.courierName,
        scheduledAt: delivery.scheduledAt ? delivery.scheduledAt.toISOString() : null,
        scheduledByName: delivery.scheduledBy?.name.trim() || null,
      },
      status: delivery.statusCode,
      branch: { name: delivery.branch.name },
      order: delivery.order
        ? {
            orderNumber: delivery.order.orderNumber,
            sapDocType: delivery.order.sapDocType,
            sapDocNum: delivery.order.sapDocNum,
          }
        : null,
      sapDocuments: delivery.sapDocuments.map((row) => ({
        ...row,
        docDate: row.docDate ? row.docDate.toISOString() : null,
      })),
      orderLines,
      serials: delivery.lines.map((line) => ({
        serialNumberId: line.serialNumberId,
        serialNo: line.serialNumber.serialNo,
        skuCode: line.serialNumber.model.skuCode,
        modelName: line.serialNumber.model.name,
      })),
      latestReturn: delivery.returnRequests[0] ?? null,
      history: history.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        userName: row.user?.name || null,
      })),
    };
  },

  /** Saves waybill, courier, and schedule date. Does not move stock or change status. */
  async saveShipment(
    actor: PostingActor,
    deliveryId: string,
    input: { waybillNo: string; courierName: string; scheduledAt: Date },
  ) {
    const delivery = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: {
        id: true,
        deliveryNo: true,
        branchId: true,
        sourceWarehouseId: true,
        statusCode: { select: { code: true } },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, {
      branchId: delivery.branchId,
      sourceWarehouseId: delivery.sourceWarehouseId,
    });
    if (delivery.statusCode.code === DELIVERY_WORKFLOW_CODE.rejected) {
      throw new Error("This delivery is closed");
    }

    await prisma.branchDelivery.update({
      where: { id: delivery.id },
      data: {
        waybillNo: input.waybillNo,
        courierName: input.courierName,
        scheduledAt: input.scheduledAt,
        scheduledById: actor.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: "delivery.shipment_saved",
        entityType: "BranchDelivery",
        entityId: delivery.id,
        metadata: {
          deliveryNo: delivery.deliveryNo,
          waybillNo: input.waybillNo,
          courierName: input.courierName,
          scheduledAt: input.scheduledAt.toISOString().slice(0, 10),
        },
      },
    });
    return { id: delivery.id };
  },

  /** Serials on a dispatched delivery, split by whether the branch has received them. */
  async listReceiptLines(
    actor: PostingActor,
    deliveryId: string,
  ): Promise<{ deliveryNo: string; status: DeliveryPostingView["status"]; lines: DeliveryReceiptLine[] }> {
    const preview = await loadDelivery(actor.tenantId, deliveryId);
    if (!preview) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, preview);

    const header = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: {
        deliveryNo: true,
        lines: {
          select: {
            serialNumberId: true,
            serialNumber: {
              select: { serialNo: true, model: { select: { skuCode: true, name: true } } },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
      },
    });
    if (!header) throw new Error("Delivery not found");

    const statusBySerial = new Map(preview.lines.map((line) => [line.serialNumberId, line.branchStatus]));
    const serialIds = header.lines.map((line) => line.serialNumberId);
    const [openTransfers, receivedOnTransfer, returnedLines] = await Promise.all([
      findOpenTransferLines(prisma, actor.tenantId, serialIds),
      serialIds.length
        ? prisma.deliveryTransferLine.findMany({
            where: {
              serialNumberId: { in: serialIds },
              status: "RECEIVED",
              transfer: { tenantId: actor.tenantId, deliveryId },
            },
            select: { serialNumberId: true },
          })
        : Promise.resolve([]),
      serialIds.length
        ? prisma.deliveryReturnLine.findMany({
            where: {
              serialNumberId: { in: serialIds },
              returnRequest: { tenantId: actor.tenantId, deliveryId, status: "COMPLETED" },
            },
            select: { serialNumberId: true },
          })
        : Promise.resolve([]),
    ]);
    const transferredIds = new Set(receivedOnTransfer.map((row) => row.serialNumberId));
    const returnedIds = new Set(returnedLines.map((row) => row.serialNumberId));
    const transferBySerial = new Map(
      openTransfers.map((row) => [row.serialNumberId, { id: row.transferId, transferNo: row.transferNo }]),
    );
    return {
      deliveryNo: header.deliveryNo,
      status: preview.status,
      lines: header.lines.map((line) => {
        const branchStatus = statusBySerial.get(line.serialNumberId) ?? null;
        const openTransfer = transferBySerial.get(line.serialNumberId) ?? null;
        return {
          serialNumberId: line.serialNumberId,
          serialNo: line.serialNumber.serialNo,
          skuCode: line.serialNumber.model.skuCode,
          modelName: line.serialNumber.model.name,
          inTransit: branchStatus === "DIT",
          openTransfer,
          state: receiptLineState({
            branchStatus,
            onOpenTransfer: openTransfer !== null,
            receivedOnTransfer: transferredIds.has(line.serialNumberId),
            returned: returnedIds.has(line.serialNumberId),
          }),
        };
      }),
    };
  },

  async accept(input: {
    tenantId: string;
    userId: string;
    permissions: string[] | undefined;
    deliveryId: string;
    serialNumberIds?: string[];
  }): Promise<{ movedCount: number; idempotent: boolean; status: "accepted" | "partial" }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    await authorizeDeliveryScope(input, preview);
    // Units on an open unit transfer are settled by that transfer, not here.
    const requestedIds =
      input.serialNumberIds ??
      preview.lines.filter((line) => line.branchStatus === "DIT").map((line) => line.serialNumberId);
    await assertNotOnOpenTransfer(prisma, input.tenantId, requestedIds);
    const plan = planAccept(preview, input.serialNumberIds ?? null, {
      openReturn: await hasOpenReturn(prisma, input.tenantId, input.deliveryId),
    });
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

    let finalStatus: "accepted" | "partial" = plan.nextStatus;
    try {
    await prisma.$transaction(async (tx) => {
      // Lock order everywhere is serials, then the delivery row. The row lock is the
      // one a return request takes, so accept and a new request cannot interleave.
      if (plan.moveSerialIds.length > 0) await lockSerialNumbers(tx, plan.moveSerialIds);
      await lockDeliveryRow(tx, input.tenantId, input.deliveryId);
      if (await hasOpenReturn(tx, input.tenantId, input.deliveryId)) {
        throw new Error(RETURN_WAITING_ERROR);
      }
      if (plan.moveSerialIds.length > 0) {
        await assertNotOnOpenTransfer(tx, input.tenantId, plan.moveSerialIds);
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
      // Units that left on a unit transfer no longer hold the delivery open.
      finalStatus = (await finalizeDeliveryIfSettled(tx, input.tenantId, input.deliveryId)) ?? plan.nextStatus;

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
            status: finalStatus,
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
      status: finalStatus,
    };
  },
};
