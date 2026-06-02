import { auditService } from "@/features/audit/services/audit.service";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { prisma } from "@/lib/database/client";
import type { Prisma, SapIntegrationJob } from "@prisma/client";

const RETRY_DELAY_MS = 30_000;

function mockSapDocRef(jobType: string, referenceId: string) {
  return `SAP-${jobType.toUpperCase().slice(0, 3)}-${referenceId.slice(-8).toUpperCase()}`;
}

async function enqueueJob(input: {
  tenantId: string;
  jobType: SapIntegrationJob["jobType"];
  idempotencyKey: string;
  payload: Record<string, unknown>;
  referenceType?: string;
  referenceId?: string;
}) {
  const existing = await sapIntegrationRepository.findByIdempotencyKey(
    input.tenantId,
    input.idempotencyKey,
  );
  if (existing) return existing;

  return sapIntegrationRepository.createJob({
    tenantId: input.tenantId,
    jobType: input.jobType,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload as Prisma.InputJsonValue,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  });
}

async function processApprovedOrderJob(
  tenantId: string,
  userId: string | undefined,
  job: SapIntegrationJob,
) {
  const orderId = job.referenceId;
  if (!orderId) throw new Error("Missing order reference");

  const order = await prisma.branchOrder.findFirst({
    where: { id: orderId, tenantId },
    include: {
      branch: { select: { name: true, sapCode: true } },
      details: {
        include: {
          model: { select: { skuCode: true, name: true, cbm: true } },
        },
      },
    },
  });
  if (!order) throw new Error("Order not found");

  const sapDocRef = mockSapDocRef("approved_order", orderId);

  await prisma.branchOrder.update({
    where: { id: orderId },
    data: { sapDocRef },
  });

  let delivery = await prisma.branchDelivery.findFirst({
    where: { tenantId, orderId },
  });

  if (!delivery && userId) {
    delivery = await logisticsService.createDeliveryFromApprovedOrder(tenantId, userId, {
      id: order.id,
      branchId: order.branchId,
      branchName: order.branch.name,
      orderNumber: order.orderNumber,
    });
  }

  if (delivery) {
    await prisma.branchDelivery.update({
      where: { id: delivery.id },
      data: { sapDocRef },
    });
  }

  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);

  await auditService.log({
    tenantId,
    userId,
    action: "sap.order_processed",
    entityType: SAP_REFERENCE_TYPES.BranchOrder,
    entityId: orderId,
    metadata: {
      sapDocRef,
      orderNumber: order.orderNumber,
      deliveryId: delivery?.id,
      jobId: job.id,
    },
  });

  return sapDocRef;
}

async function processInventoryAdjustmentJob(tenantId: string, userId: string | undefined, job: SapIntegrationJob) {
  const varianceId = job.referenceId;
  if (!varianceId) throw new Error("Missing variance reference");

  const sapDocRef = mockSapDocRef("inventory_adjustment", varianceId);

  await prisma.stockVariance.update({
    where: { id: varianceId, tenantId },
    data: { sapDocRef, status: "closed" },
  });

  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);

  await auditService.log({
    tenantId,
    userId,
    action: "sap.inventory_adjustment_processed",
    entityType: "StockVariance",
    entityId: varianceId,
    metadata: { sapDocRef, jobId: job.id },
  });

  return sapDocRef;
}

async function processStubJob(
  tenantId: string,
  userId: string | undefined,
  job: SapIntegrationJob,
  entityType: string,
) {
  const refId = job.referenceId ?? job.id;
  const sapDocRef = mockSapDocRef(job.jobType, refId);

  if (job.referenceType === SAP_REFERENCE_TYPES.BranchPullout && job.referenceId) {
    await prisma.branchPullout.update({
      where: { id: job.referenceId, tenantId },
      data: { sapDocRef },
    });
  }

  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);

  await auditService.log({
    tenantId,
    userId,
    action: `sap.${job.jobType}_processed`,
    entityType,
    entityId: refId,
    metadata: { sapDocRef, jobId: job.id, stub: true },
  });

  return sapDocRef;
}

export const sapService = {
  listJobs(tenantId: string, pagination?: { page?: number; status?: string }) {
    return sapIntegrationRepository.listJobs(tenantId, pagination);
  },

  /** CSV step 11 — emit approved order to SAP queue. */
  async emitApprovedOrder(
    tenantId: string,
    order: {
      id: string;
      orderNumber: string;
      branchId: string;
      branchSapCode: string;
      processedAt: Date | null;
      lines: { skuCode: string; approvedQty: number | null; quantity: number }[];
    },
  ) {
    return enqueueJob({
      tenantId,
      jobType: "approved_order",
      idempotencyKey: `approved_order:${order.id}`,
      referenceType: SAP_REFERENCE_TYPES.BranchOrder,
      referenceId: order.id,
      payload: {
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        branchSapCode: order.branchSapCode,
        processedAt: order.processedAt?.toISOString() ?? null,
        lines: order.lines,
      },
    });
  },

  /** Process D — pull-out ITR sync (stub). */
  async emitPulloutItr(
    tenantId: string,
    pullout: { id: string; pulloutNo: string; branchId: string; warehouseId: string },
  ) {
    return enqueueJob({
      tenantId,
      jobType: "pullout_itr",
      idempotencyKey: `pullout_itr:${pullout.id}`,
      referenceType: SAP_REFERENCE_TYPES.BranchPullout,
      referenceId: pullout.id,
      payload: pullout,
    });
  },

  /** CSV step 26 — sales summary export (stub). */
  async emitSalesSummary(
    tenantId: string,
    input: { periodLabel: string; branchId?: string; transactionIds: string[] },
  ) {
    const key = `sales_summary:${input.periodLabel}:${input.branchId ?? "all"}:${input.transactionIds.length}`;
    return enqueueJob({
      tenantId,
      jobType: "sales_summary",
      idempotencyKey: key,
      payload: input,
    });
  },

  /** CSV steps 1–2 — inventory sync from SAP (stub). */
  async syncInventoryFromSap(tenantId: string, input: { warehouseCode?: string }) {
    const key = `inventory_sync:${input.warehouseCode ?? "default"}:${new Date().toISOString().slice(0, 10)}`;
    return enqueueJob({
      tenantId,
      jobType: "inventory_sync_inbound",
      idempotencyKey: key,
      payload: input,
    });
  },

  /** CSV step 41 — inventory adjustment handoff. */
  async emitInventoryAdjustment(
    tenantId: string,
    input: {
      varianceId: string;
      sessionId: string;
      varianceType: string;
      description: string | null;
    },
  ) {
    return enqueueJob({
      tenantId,
      jobType: "inventory_adjustment",
      idempotencyKey: `inventory_adjustment:${input.varianceId}`,
      referenceType: "StockVariance",
      referenceId: input.varianceId,
      payload: input,
    });
  },

  /** Process pending/failed jobs with retry handling (mock local processor). */
  async processPendingJobs(tenantId: string, userId?: string, limit = 10) {
    const jobs = await sapIntegrationRepository.claimPendingJobsSafe(tenantId, limit);
    const results: { jobId: string; status: string; sapDocRef?: string; error?: string }[] = [];

    for (const job of jobs) {
      // Job is already claimed (status=processing, attemptCount incremented) by
      // claimPendingJobsSafe — no separate markProcessing step.
      const updated = job;
      try {
        let sapDocRef: string;
        switch (updated.jobType) {
          case "approved_order":
            sapDocRef = await processApprovedOrderJob(tenantId, userId, updated);
            break;
          case "inventory_adjustment":
            sapDocRef = await processInventoryAdjustmentJob(tenantId, userId, updated);
            break;
          case "pullout_itr":
            sapDocRef = await processStubJob(
              tenantId,
              userId,
              updated,
              SAP_REFERENCE_TYPES.BranchPullout,
            );
            break;
          case "sales_summary":
          case "inventory_sync_inbound":
          case "delivery_sync_inbound":
            sapDocRef = await processStubJob(tenantId, userId, updated, updated.jobType);
            break;
          default:
            throw new Error(`Unsupported job type: ${updated.jobType}`);
        }
        results.push({ jobId: job.id, status: "completed", sapDocRef });
      } catch (error) {
        const message = error instanceof Error ? error.message : "SAP processing failed";
        const deadLetter = updated.attemptCount >= updated.maxAttempts;
        const nextRetryAt = deadLetter
          ? undefined
          : new Date(Date.now() + RETRY_DELAY_MS * updated.attemptCount);

        await sapIntegrationRepository.markFailed(job.id, message, nextRetryAt, deadLetter);

        await auditService.log({
          tenantId,
          userId,
          action: deadLetter ? "sap.job_dead_letter" : "sap.job_failed",
          entityType: "SapIntegrationJob",
          entityId: job.id,
          metadata: { jobType: job.jobType, error: message, attemptCount: updated.attemptCount },
        });

        results.push({ jobId: job.id, status: deadLetter ? "dead_letter" : "failed", error: message });
      }
    }

    return results;
  },
};
