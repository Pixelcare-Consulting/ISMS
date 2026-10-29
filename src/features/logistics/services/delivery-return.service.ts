import type { DeliveryReturnStatus, SapOrderDocType } from "@prisma/client";
import { z } from "zod";

import { Prisma } from "@/lib/database/generated/prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
import {
  resolveLogisticsCapabilities,
  type LogisticsActionCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import { loadDelivery } from "@/features/logistics/services/delivery-posting.service";
import { findOpenReturnLines, lockDeliveryRow } from "@/features/logistics/services/delivery-settle";
import { DELIVERY_RETURN_ENTITY } from "@/features/logistics/services/delivery-return-completion";
import {
  nextReturnNo,
  planReturnCancel,
  planReturnDecision,
  planReturnRequest,
  planReturnSapReady,
  RETURN_ALREADY_OPEN_ERROR,
  RETURN_ON_TRANSFER_ERROR,
  DEFAULT_REJECT_REMARKS,
  RETURN_LINE_REMARKS_MAX,
  RETURN_REASON_MAX,
} from "@/features/logistics/services/delivery-return.planner";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { findOpenTransferLines } from "@/features/logistics/services/delivery-transfer-open-lines";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { prisma } from "@/lib/database/client";

/**
 * Full return of a dispatched delivery's in-transit units (Step 5).
 * Request (operator) → approve or reject (approver) → on approve, the SAP IT or
 * Return posts inline and the job's success path moves the units back
 * (delivery-return-completion). A failed post leaves the request APPROVED with
 * sapError, retried from the deliveries list, or cancelled by an approver while
 * SAP has no document for it.
 */

/** Input rules shared by the logistics and operations actions. */
/** Optional: blank remarks fall back to DEFAULT_REJECT_REMARKS in the service. */
export const deliveryReturnReasonSchema = z
  .string()
  .trim()
  .max(RETURN_REASON_MAX, `The remarks can be up to ${RETURN_REASON_MAX} characters`)
  .nullish();
/** Rejected units with optional remarks each; omitted or null rejects every unit still in transit. */
export const deliveryReturnUnitsSchema = z
  .array(
    z.object({
      serialNumberId: z.string().min(1),
      remarks: z
        .string()
        .trim()
        .max(RETURN_LINE_REMARKS_MAX, `A unit's remarks can be up to ${RETURN_LINE_REMARKS_MAX} characters`)
        .nullish(),
    }),
  )
  .min(1, "Tick the units to reject")
  .nullish();

export interface DeliveryReturnUnitInput {
  serialNumberId: string;
  remarks?: string | null;
}
export const deliveryReturnDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(RETURN_REASON_MAX, `The note can be up to ${RETURN_REASON_MAX} characters`).nullish(),
});
export const deliveryReturnCancelNoteSchema = z
  .string()
  .trim()
  .min(1, "Enter the reason for cancelling the return")
  .max(RETURN_REASON_MAX, `The note can be up to ${RETURN_REASON_MAX} characters`);

export interface DeliveryReturnSummary {
  id: string;
  requestNo: string;
  status: DeliveryReturnStatus;
  sapError: string | null;
}

export interface DeliveryReturnDetail extends DeliveryReturnSummary {
  deliveryId: string;
  deliveryNo: string;
  /** ITR (consignment, posts an IT) or SO (outright); null on orders from before SAP posting. */
  orderSapDocType: SapOrderDocType | null;
  branchName: string;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  sapDocNo: string | null;
  sapDocDate: string | null;
  units: { serialNumberId: string; serialNo: string; skuCode: string; modelName: string; remarks: string | null }[];
}

export interface DeliveryReturnOutcome {
  status: DeliveryReturnStatus;
  sapDocNo: string | null;
  sapError: string | null;
}

type Capability = keyof Pick<LogisticsActionCapabilities, "canRequestDeliveryReturn" | "canApproveDeliveryReturn">;

const CAPABILITY_ERRORS: Record<Capability, string> = {
  canRequestDeliveryReturn: "You do not have permission to request delivery returns",
  canApproveDeliveryReturn: "You do not have permission to approve delivery returns",
};

function requireCapability(actor: PostingActor, capability: Capability) {
  if (!resolveLogisticsCapabilities(actor.permissions)[capability]) {
    throw new Error(CAPABILITY_ERRORS[capability]);
  }
}

function returnError(error: unknown, fallback: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
    if (/request_?no/i.test(fields)) return new Error("Could not number the reject request. Try again.");
  }
  return error instanceof Error ? error : new Error(fallback);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, RETURN_REASON_MAX);
}

/** Loads a return with its delivery, checks it exists, and enforces delivery scope. */
async function loadScopedReturn(actor: PostingActor, returnId: string) {
  const row = await prisma.deliveryReturnRequest.findFirst({
    where: { id: returnId, tenantId: actor.tenantId },
    select: {
      id: true,
      requestNo: true,
      status: true,
      sapDocEntry: true,
      delivery: { select: { branchId: true, sourceWarehouseId: true } },
    },
  });
  if (!row) throw new Error("Return request not found");
  await authorizeDeliveryScope(actor, row.delivery);
  return row;
}

async function readOutcome(tenantId: string, returnId: string): Promise<DeliveryReturnOutcome> {
  const row = await prisma.deliveryReturnRequest.findFirst({
    where: { id: returnId, tenantId },
    select: { status: true, sapDocNo: true, sapError: true },
  });
  if (!row) throw new Error("Return request not found");
  return row;
}

/**
 * Queues and runs the SAP job inline. The job's own failure path saves
 * sapError on the request; this catch covers a failure before the job ran.
 */
async function postToSap(actor: PostingActor, request: { id: string; requestNo: string }, requeue: boolean) {
  try {
    await sapService.emitDeliveryReturn(actor.tenantId, { id: request.id, requestNo: request.requestNo });
    if (requeue) {
      await sapIntegrationRepository.requeueByReference(
        actor.tenantId,
        SAP_REFERENCE_TYPES.DeliveryReturnRequest,
        request.id,
      );
    }
    // Only this return's job: a backlog of other jobs must not leave it APPROVED.
    await sapService.processPendingJobs(actor.tenantId, actor.userId, 1, {
      referenceType: SAP_REFERENCE_TYPES.DeliveryReturnRequest,
      referenceId: request.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAP posting failed";
    await prisma.deliveryReturnRequest.updateMany({
      where: { id: request.id, tenantId: actor.tenantId, status: "APPROVED" },
      data: { sapError: message },
    });
    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "delivery_return.sap_emit_failed",
      entityType: DELIVERY_RETURN_ENTITY,
      entityId: request.id,
      metadata: { error: message },
    });
  }
}

export const deliveryReturnService = {
  /** Operator asks to send in-transit units back (all, or the ticked ones). Units stay DIT until the return completes. */
  async request(
    actor: PostingActor,
    input: { deliveryId: string; reason?: string | null; units?: DeliveryReturnUnitInput[] | null },
  ): Promise<{ id: string; requestNo: string }> {
    requireCapability(actor, "canRequestDeliveryReturn");
    const reason = cleanText(input.reason) || DEFAULT_REJECT_REMARKS;

    const delivery = await loadDelivery(actor.tenantId, input.deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, delivery);

    const ditIds = delivery.lines.filter((line) => line.branchStatus === "DIT").map((line) => line.serialNumberId);
    const [openReturns, openTransfers] = await Promise.all([
      findOpenReturnLines(prisma, actor.tenantId, ditIds),
      findOpenTransferLines(prisma, actor.tenantId, ditIds),
    ]);
    const plan = planReturnRequest(
      delivery,
      new Set(openReturns.map((row) => row.serialNumberId)),
      new Set(openTransfers.map((row) => row.serialNumberId)),
      input.units?.map((unit) => unit.serialNumberId) ?? null,
    );
    // A unit with no remarks of its own carries the request remarks.
    const remarksBySerial = new Map(
      (input.units ?? []).map((unit) => [unit.serialNumberId, cleanText(unit.remarks)]),
    );
    if (!plan.ok) throw new Error(plan.error);
    const sapReady = planReturnSapReady(delivery);
    if (!sapReady.ok) throw new Error(sapReady.error);
    const serialIds = plan.lines.map((line) => line.serialNumberId);

    try {
      return await prisma.$transaction(async (tx) => {
        // Same order as accept: serials, then the delivery row. Re-check under both locks.
        await lockSerialNumbers(tx, serialIds);
        await lockDeliveryRow(tx, actor.tenantId, delivery.id);
        if ((await findOpenReturnLines(tx, actor.tenantId, serialIds)).length > 0) {
          throw new Error(RETURN_ALREADY_OPEN_ERROR);
        }
        if ((await findOpenTransferLines(tx, actor.tenantId, serialIds)).length > 0) {
          throw new Error(RETURN_ON_TRANSFER_ERROR);
        }
        const header = await tx.branchDelivery.findFirst({
          where: { id: delivery.id, tenantId: actor.tenantId },
          select: { statusCode: { select: { code: true } } },
        });
        const status = header?.statusCode.code;
        if (status !== "pending" && status !== "partial") {
          throw new Error("This delivery changed. Reload and try again.");
        }
        const inTransit = await tx.branchInventory.count({
          where: {
            tenantId: actor.tenantId,
            branchId: delivery.branchId,
            serialNumberId: { in: serialIds },
            statusCode: { code: "DIT" },
          },
        });
        assertExclusiveClaim(inTransit, serialIds.length, "This delivery changed. Reload and try again.");

        const row = await tx.deliveryReturnRequest.create({
          data: {
            tenantId: actor.tenantId,
            deliveryId: delivery.id,
            requestNo: nextReturnNo(),
            reason,
            requestedById: actor.userId,
            lines: {
              create: plan.lines.map((line) => ({
                ...line,
                remarks: remarksBySerial.get(line.serialNumberId) || reason,
              })),
            },
          },
          select: { id: true, requestNo: true },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "delivery_return.requested",
            entityType: DELIVERY_RETURN_ENTITY,
            entityId: row.id,
            metadata: { requestNo: row.requestNo, deliveryId: delivery.id, reason, serialNumberIds: serialIds },
          },
        });
        return row;
      });
    } catch (error) {
      throw returnError(error, "Failed to request the return");
    }
  },

  /** One reject request, for the review dialog. A delivery can have several. */
  async get(actor: PostingActor, returnId: string): Promise<DeliveryReturnDetail> {
    const row = await prisma.deliveryReturnRequest.findFirst({
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
        lines: {
          orderBy: { serialNumber: { serialNo: "asc" } },
          select: {
            serialNumberId: true,
            remarks: true,
            serialNumber: { select: { serialNo: true, model: { select: { skuCode: true, name: true } } } },
          },
        },
      },
    });
    if (!row) throw new Error("Reject request not found");
    const delivery = await prisma.branchDelivery.findFirst({
      where: { id: row.deliveryId, tenantId: actor.tenantId },
      select: {
        branchId: true,
        sourceWarehouseId: true,
        deliveryNo: true,
        branch: { select: { name: true } },
        order: { select: { sapDocType: true } },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, delivery);
    return {
      id: row.id,
      requestNo: row.requestNo,
      status: row.status,
      sapError: row.sapError,
      deliveryId: row.deliveryId,
      deliveryNo: delivery.deliveryNo,
      orderSapDocType: delivery.order?.sapDocType ?? null,
      branchName: delivery.branch.name,
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
      })),
    };
  },

  /**
   * Approver decision. Reject cancels the request and the units stay in transit.
   * Approve is committed first; the SAP post then runs and may fail on its own.
   */
  async decide(
    actor: PostingActor,
    returnId: string,
    action: "APPROVE" | "REJECT",
    note?: string | null,
  ): Promise<DeliveryReturnOutcome> {
    requireCapability(actor, "canApproveDeliveryReturn");
    const request = await loadScopedReturn(actor, returnId);
    const plan = planReturnDecision(request.status, action);
    if (!plan.ok) throw new Error(plan.error);
    const decisionNote = cleanText(note) || null;

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.deliveryReturnRequest.updateMany({
        where: { id: returnId, tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
        data: { status: plan.next, decidedById: actor.userId, decidedAt: new Date(), decisionNote },
      });
      assertExclusiveClaim(claimed.count, 1, "This return request has already been decided");
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: plan.next === "APPROVED" ? "delivery_return.approved" : "delivery_return.cancelled",
          entityType: DELIVERY_RETURN_ENTITY,
          entityId: returnId,
          metadata: { requestNo: request.requestNo, ...(decisionNote ? { note: decisionNote } : {}) },
        },
      });
    });

    if (plan.next === "APPROVED") await postToSap(actor, request, false);
    return readOutcome(actor.tenantId, returnId);
  },

  /**
   * Approver backs out of an approved return SAP never took: the request
   * closes, the units stay in transit, and its queued SAP job is retired in the
   * same transaction so no worker posts it later.
   */
  async cancelApproved(actor: PostingActor, returnId: string, note: string): Promise<DeliveryReturnOutcome> {
    requireCapability(actor, "canApproveDeliveryReturn");
    const request = await loadScopedReturn(actor, returnId);
    const decisionNote = cleanText(note);
    const plan = planReturnCancel(request, decisionNote);
    if (!plan.ok) throw new Error(plan.error);

    await prisma.$transaction(async (tx) => {
      const ref = [actor.tenantId, SAP_REFERENCE_TYPES.DeliveryReturnRequest, returnId] as const;
      // Retire the job first: a worker that claimed it before this point is seen below.
      await sapIntegrationRepository.deadLetterByReference(...ref, "Return cancelled in ISMS", tx);
      if ((await sapIntegrationRepository.countInFlight(...ref, tx)) > 0) {
        throw new Error("SAP is posting this return right now. Try again in a minute.");
      }
      const claimed = await tx.deliveryReturnRequest.updateMany({
        where: { id: returnId, tenantId: actor.tenantId, status: "APPROVED", sapDocEntry: null },
        data: {
          status: "CANCELLED",
          decidedById: actor.userId,
          decidedAt: new Date(),
          decisionNote,
          sapError: null,
        },
      });
      assertExclusiveClaim(claimed.count, 1, "This return changed. Reload and try again.");
      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "delivery_return.cancelled_after_approval",
          entityType: DELIVERY_RETURN_ENTITY,
          entityId: returnId,
          metadata: { requestNo: request.requestNo, note: decisionNote },
        },
      });
    });
    return readOutcome(actor.tenantId, returnId);
  },

  /** Re-queues the SAP job of an approved return whose post failed, then runs it. */
  async retrySap(actor: PostingActor, returnId: string): Promise<DeliveryReturnOutcome> {
    const caps = resolveLogisticsCapabilities(actor.permissions);
    if (!caps.canApproveDeliveryReturn && !caps.canRequestDeliveryReturn) {
      throw new Error("You do not have permission to retry delivery returns");
    }
    const request = await loadScopedReturn(actor, returnId);
    if (request.status !== "APPROVED") {
      throw new Error("Only an approved return waiting for SAP can be retried");
    }
    await postToSap(actor, request, true);
    return readOutcome(actor.tenantId, returnId);
  },
};
