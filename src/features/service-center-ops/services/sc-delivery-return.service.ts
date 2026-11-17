import { Prisma } from "@/lib/database/generated/prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  inventoryApprovalLedger,
  type InventoryApprovalDocument,
} from "@/features/inventory-approvals/services/inventory-approval-ledger";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import { RETURN_REASON_MAX } from "@/features/logistics/services/delivery-return.planner";
import type {
  DeliveryReturnDetail,
  DeliveryReturnOutcome,
  DeliveryReturnUnitInput,
} from "@/features/logistics/services/delivery-return.service";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";
import {
  nextScReturnNo,
  planScReturnRequest,
  SC_DEFAULT_REJECT_REMARKS,
  SC_OPEN_RETURN_STATUSES,
  SC_RETURN_ALREADY_OPEN_ERROR,
} from "@/features/service-center-ops/lib/sc-delivery-return";
import {
  lockScDeliveryRow,
  SC_DELIVERY_RETURN_ENTITY,
} from "@/features/service-center-ops/services/sc-delivery-return-completion";
import { assertScInScope, resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { prisma } from "@/lib/database/client";

/**
 * SC delivery reject (the branch receive dialog's Reject, for a SAP DR made from an SC order).
 * The service center ticks units at receipt; confirming approves the request on the spot and the
 * SAP Return posts inline, and the job's success path sends the units back
 * (sc-delivery-return-completion). A failed post leaves the request APPROVED with sapError,
 * retried or cancelled from the delivery page while SAP has no document for it.
 *
 * Callers check the permission; this checks the delivery's service center is in scope.
 */

export interface ScReturnActor {
  tenantId: string;
  userId: string;
  permissions: string[] | undefined;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, RETURN_REASON_MAX);
}

function approvalDocument(tenantId: string, request: { id: string; requestNo: string }): InventoryApprovalDocument {
  return {
    tenantId,
    sourceType: "SC_DELIVERY_RETURN",
    sourceId: request.id,
    sourceNo: request.requestNo,
    step: "APPROVAL",
  };
}

function returnError(error: unknown, fallback: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("Could not number the reject request. Try again.");
  }
  return error instanceof Error ? error : new Error(fallback);
}

async function assertScope(actor: ScReturnActor, serviceCenterId: string): Promise<void> {
  const scopedIds = await resolveScIdsForUser(actor.tenantId, actor.userId, actor.permissions);
  assertScInScope(serviceCenterId, scopedIds);
}

/** Serials of this delivery on a pending or approved SC reject. */
function findOpenReturnLines(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  serialIds: readonly string[],
) {
  return db.serviceCenterDeliveryReturnLine.findMany({
    where: {
      serialNumberId: { in: [...serialIds] },
      returnRequest: { tenantId, status: { in: [...SC_OPEN_RETURN_STATUSES] } },
    },
    select: { serialNumberId: true },
  });
}

async function loadScopedReturn(actor: ScReturnActor, returnId: string) {
  const row = await prisma.serviceCenterDeliveryReturnRequest.findFirst({
    where: { id: returnId, tenantId: actor.tenantId },
    select: {
      id: true,
      requestNo: true,
      status: true,
      sapDocEntry: true,
      delivery: { select: { serviceCenterId: true } },
      lines: { select: { serialNumberId: true } },
    },
  });
  if (!row) throw new Error("Reject request not found");
  await assertScope(actor, row.delivery.serviceCenterId);
  return row;
}

async function readOutcome(tenantId: string, returnId: string): Promise<DeliveryReturnOutcome> {
  const row = await prisma.serviceCenterDeliveryReturnRequest.findFirst({
    where: { id: returnId, tenantId },
    select: { status: true, sapDocNo: true, sapError: true },
  });
  if (!row) throw new Error("Reject request not found");
  return row;
}

/**
 * Queues and runs this reject's SAP job inline. The job's own failure path saves sapError on the
 * request; this catch covers a failure before the job ran.
 */
async function postToSap(actor: ScReturnActor, request: { id: string; requestNo: string }, requeue: boolean) {
  const reference = { referenceType: SAP_REFERENCE_TYPES.ScDeliveryReturnRequest, referenceId: request.id };
  try {
    await sapService.emitScDeliveryReturn(actor.tenantId, { id: request.id, requestNo: request.requestNo });
    if (requeue) {
      await sapIntegrationRepository.requeueByReference(actor.tenantId, reference.referenceType, request.id);
    }
    await sapService.processPendingJobs(actor.tenantId, actor.userId, 1, reference);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAP posting failed";
    await prisma.serviceCenterDeliveryReturnRequest.updateMany({
      where: { id: request.id, tenantId: actor.tenantId, status: "APPROVED" },
      data: { sapError: message },
    });
    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "sc_delivery_return.sap_emit_failed",
      entityType: SC_DELIVERY_RETURN_ENTITY,
      entityId: request.id,
      metadata: { error: message },
    });
  }
}

export const scDeliveryReturnService = {
  /** Rejects the ticked in-transit units; approved at once, the SAP Return posts inline. */
  async request(
    actor: ScReturnActor,
    input: { deliveryId: string; reason?: string | null; units: DeliveryReturnUnitInput[] },
  ): Promise<{ id: string; requestNo: string } & DeliveryReturnOutcome> {
    const reason = cleanText(input.reason) || SC_DEFAULT_REJECT_REMARKS;
    const delivery = await prisma.serviceCenterDelivery.findFirst({
      where: { id: input.deliveryId, tenantId: actor.tenantId },
      select: {
        id: true,
        deliveryNo: true,
        serviceCenterId: true,
        orderId: true,
        statusCode: { select: { code: true } },
        order: { select: { sapCardCode: true, sapWarehouseCode: true, sapDocEntry: true } },
        lines: { select: { serialNumberId: true, acceptedAt: true, returnedAt: true } },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    await assertScope(actor, delivery.serviceCenterId);

    const requestedIds = input.units.map((unit) => unit.serialNumberId);
    const openReturns = await findOpenReturnLines(prisma, actor.tenantId, requestedIds);
    const plan = planScReturnRequest({
      status: delivery.statusCode?.code ?? "pending",
      fromOrder: delivery.orderId !== null && delivery.lines.length > 0,
      lines: delivery.lines,
      onOpenReturn: new Set(openReturns.map((row) => row.serialNumberId)),
      requestedSerialIds: requestedIds,
    });
    if (!plan.ok) throw new Error(plan.error);
    const order = delivery.order;
    if (!order?.sapDocEntry) throw new Error("The SC order is not in SAP, so there is nothing to return");
    if (!order.sapCardCode || !order.sapWarehouseCode) {
      throw new Error("The SC order has no SAP customer or warehouse stored");
    }

    const serialIds = plan.serialNumberIds;
    // A unit with no remarks of its own carries the request remarks.
    const remarksBySerial = new Map(input.units.map((unit) => [unit.serialNumberId, cleanText(unit.remarks)]));
    const defectiveIds = new Set(input.units.filter((unit) => unit.markDefective).map((unit) => unit.serialNumberId));
    const lineRemarks = (serialNumberId: string) => remarksBySerial.get(serialNumberId) || reason;

    let created: { id: string; requestNo: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        // Same order as completion: serials, then the delivery row. Re-check under both locks.
        await lockSerialNumbers(tx, serialIds);
        await lockScDeliveryRow(tx, actor.tenantId, delivery.id);
        if ((await findOpenReturnLines(tx, actor.tenantId, serialIds)).length > 0) {
          throw new Error(SC_RETURN_ALREADY_OPEN_ERROR);
        }
        const [header, open] = await Promise.all([
          tx.serviceCenterDelivery.findFirst({
            where: { id: delivery.id, tenantId: actor.tenantId },
            select: { statusCode: { select: { code: true } } },
          }),
          tx.serviceCenterDeliveryLine.count({
            where: { deliveryId: delivery.id, serialNumberId: { in: serialIds }, acceptedAt: null, returnedAt: null },
          }),
        ]);
        const status = header?.statusCode?.code ?? "pending";
        if (status !== "pending" && status !== "partial") {
          throw new Error("This delivery changed. Reload and try again.");
        }
        assertExclusiveClaim(open, serialIds.length, "This delivery changed. Reload and try again.");

        const row = await tx.serviceCenterDeliveryReturnRequest.create({
          data: {
            tenantId: actor.tenantId,
            deliveryId: delivery.id,
            requestNo: nextScReturnNo(),
            reason,
            requestedById: actor.userId,
            // Confirming the reject is the approval: no one else decides it.
            status: "APPROVED",
            decidedById: actor.userId,
            decidedAt: new Date(),
            lines: {
              createMany: {
                data: serialIds.map((serialNumberId) => ({
                  serialNumberId,
                  remarks: lineRemarks(serialNumberId),
                  markDefective: defectiveIds.has(serialNumberId),
                })),
              },
            },
          },
          select: { id: true, requestNo: true },
        });
        const approval = approvalDocument(actor.tenantId, row);
        await inventoryApprovalLedger.recordRequested(tx, approval, {
          requestedById: actor.userId,
          units: serialIds.map((serialNumberId) => ({ serialNumberId, remarks: lineRemarks(serialNumberId) })),
        });
        await inventoryApprovalLedger.recordDecision(tx, approval, {
          serialNumberIds: serialIds,
          status: "APPROVED",
          decidedById: actor.userId,
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "sc_delivery_return.requested",
            entityType: SC_DELIVERY_RETURN_ENTITY,
            entityId: row.id,
            metadata: {
              requestNo: row.requestNo,
              deliveryId: delivery.id,
              deliveryNo: delivery.deliveryNo,
              reason,
              serialNumberIds: serialIds,
              approvedOnRequest: true,
              ...(defectiveIds.size > 0 ? { defectiveSerialNumberIds: [...defectiveIds] } : {}),
            },
          },
        });
        return row;
      });
    } catch (error) {
      throw returnError(error, "Failed to reject the units");
    }

    await postToSap(actor, created, false);
    return { ...created, ...(await readOutcome(actor.tenantId, created.id)) };
  },

  /** One reject request, in the shape the branch review dialog reads. */
  async get(actor: ScReturnActor, returnId: string): Promise<DeliveryReturnDetail> {
    const row = await prisma.serviceCenterDeliveryReturnRequest.findFirst({
      where: { id: returnId, tenantId: actor.tenantId },
      select: {
        id: true,
        deliveryId: true,
        requestNo: true,
        status: true,
        reason: true,
        requestedAt: true,
        decidedAt: true,
        decisionNote: true,
        sapDocNo: true,
        sapDocDate: true,
        sapError: true,
        requestedBy: { select: { name: true } },
        decidedBy: { select: { name: true } },
        delivery: { select: { deliveryNo: true, serviceCenterId: true, serviceCenter: { select: { name: true } } } },
        lines: {
          orderBy: { serialNumber: { serialNo: "asc" } },
          select: {
            serialNumberId: true,
            remarks: true,
            markDefective: true,
            serialNumber: { select: { serialNo: true, model: { select: { skuCode: true, name: true } } } },
          },
        },
      },
    });
    if (!row) throw new Error("Reject request not found");
    await assertScope(actor, row.delivery.serviceCenterId);
    return {
      id: row.id,
      requestNo: row.requestNo,
      status: row.status,
      sapError: row.sapError,
      deliveryId: row.deliveryId,
      deliveryNo: row.delivery.deliveryNo,
      // SC orders post a Sales Order, so a reject posts a Return.
      orderSapDocType: "SO",
      branchName: row.delivery.serviceCenter.name,
      reason: row.reason,
      requestedByName: row.requestedBy.name || null,
      requestedAt: row.requestedAt.toISOString(),
      decidedByName: row.decidedBy?.name || null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      decisionNote: row.decisionNote,
      sapDocNo: row.sapDocNo,
      sapDocDate: row.sapDocDate ? row.sapDocDate.toISOString().slice(0, 10) : null,
      units: row.lines.map((line) => ({
        serialNumberId: line.serialNumberId,
        serialNo: line.serialNumber.serialNo,
        skuCode: line.serialNumber.model.skuCode,
        modelName: line.serialNumber.model.name,
        remarks: line.remarks,
        markDefective: line.markDefective,
      })),
    };
  },

  /** Re-queues the SAP job of an approved reject whose post failed, then runs it. */
  async retrySap(actor: ScReturnActor, returnId: string): Promise<DeliveryReturnOutcome> {
    const request = await loadScopedReturn(actor, returnId);
    if (request.status !== "APPROVED") {
      throw new Error("Only an approved reject waiting for SAP can be retried");
    }
    await postToSap(actor, request, true);
    return readOutcome(actor.tenantId, returnId);
  },

  /**
   * Backs out of an approved reject SAP never took: the request closes, the units stay in
   * transit, and its queued SAP job is retired in the same transaction so no worker posts it.
   */
  async cancelApproved(actor: ScReturnActor, returnId: string, note: string): Promise<DeliveryReturnOutcome> {
    const request = await loadScopedReturn(actor, returnId);
    const decisionNote = cleanText(note);
    if (!decisionNote) throw new Error("Enter the reason for cancelling the reject");
    if (request.status !== "APPROVED") throw new Error("Only an approved reject can be cancelled");
    if (request.sapDocEntry != null) throw new Error("SAP already has the Return for this reject");

    await prisma.$transaction(async (tx) => {
      const ref = [actor.tenantId, SAP_REFERENCE_TYPES.ScDeliveryReturnRequest, returnId] as const;
      // Retire the job first: a worker that claimed it before this point is seen below.
      await sapIntegrationRepository.deadLetterByReference(...ref, "Reject cancelled in ISMS", tx);
      if ((await sapIntegrationRepository.countInFlight(...ref, tx)) > 0) {
        throw new Error("SAP is posting this reject right now. Try again in a minute.");
      }
      const claimed = await tx.serviceCenterDeliveryReturnRequest.updateMany({
        where: { id: returnId, tenantId: actor.tenantId, status: "APPROVED", sapDocEntry: null },
        data: { status: "CANCELLED", decidedById: actor.userId, decidedAt: new Date(), decisionNote, sapError: null },
      });
      assertExclusiveClaim(claimed.count, 1, "This reject changed. Reload and try again.");
      await inventoryApprovalLedger.recordDecision(tx, approvalDocument(actor.tenantId, request), {
        serialNumberIds: request.lines.map((line) => line.serialNumberId),
        status: "CANCELLED",
        decidedById: actor.userId,
        remarks: decisionNote,
      });
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "sc_delivery_return.cancelled_after_approval",
          entityType: SC_DELIVERY_RETURN_ENTITY,
          entityId: returnId,
          metadata: { requestNo: request.requestNo, note: decisionNote },
        },
      });
    });
    return readOutcome(actor.tenantId, returnId);
  },
};
