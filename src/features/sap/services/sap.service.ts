import { auditService } from "@/features/audit/services/audit.service";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import {
  sapIntegrationRepository,
  type SapJobListSort,
  type SapJobListSortDir,
} from "@/features/sap/repositories/sap-integration.repository";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { sapErrorMessage } from "@/features/sap/services/sap-master-data";
import { prisma } from "@/lib/database/client";
import type { Prisma, SapIntegrationJob } from "@prisma/client";

const RETRY_DELAY_MS = 30_000;

function mockSapDocRef(jobType: string, referenceId: string) {
  return `SAP-${jobType.toUpperCase().slice(0, 3)}-${referenceId.slice(-8).toUpperCase()}`;
}

export interface InventoryPostingLinePayload {
  varianceId: string;
  varianceType: string;
  serialNo: string;
  itemCode: string;
  serialNumberId: string;
  countedQuantity: number;
  inWarehouseQuantity: number;
}

export interface InventoryPostingEmitInput {
  sessionId: string;
  sessionNo: string;
  branchId: string;
  warehouseCode: string;
  lines: InventoryPostingLinePayload[];
}

export type InventoryPostingEmitResult = {
  mode: "posted" | "queued";
  sapDocRef: string | null;
  jobId?: string;
  message: string;
};

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

function buildInventoryPostingBody(input: InventoryPostingEmitInput) {
  const countDate = new Date().toISOString().slice(0, 10);
  const byItem = new Map<
    string,
    {
      itemCode: string;
      countedQuantity: number;
      inWarehouseQuantity: number;
      serials: { manufacturerSerialNumber: string; quantity: number }[];
    }
  >();

  for (const line of input.lines) {
    if (!line.itemCode || !line.serialNo) continue;
    const key = line.itemCode;
    const entry = byItem.get(key) ?? {
      itemCode: line.itemCode,
      countedQuantity: 0,
      inWarehouseQuantity: 0,
      serials: [],
    };
    entry.countedQuantity += line.countedQuantity;
    entry.inWarehouseQuantity += line.inWarehouseQuantity;
    entry.serials.push({
      manufacturerSerialNumber: line.serialNo,
      quantity: 1,
    });
    byItem.set(key, entry);
  }

  return {
    CountDate: countDate,
    PostingDate: countDate,
    Remarks: `ISMS P-Count ${input.sessionNo}`,
    InventoryPostingLines: [...byItem.values()].map((entry) => ({
      ItemCode: entry.itemCode,
      WarehouseCode: input.warehouseCode,
      CountedQuantity: entry.countedQuantity,
      InWarehouseQuantity: entry.inWarehouseQuantity,
      InventoryPostingSerialNumbers: entry.serials.map((s) => ({
        ManufacturerSerialNumber: s.manufacturerSerialNumber,
        Quantity: s.quantity,
      })),
    })),
  };
}

async function postInventoryPostingViaServiceLayer(
  tenantId: string,
  input: InventoryPostingEmitInput,
): Promise<string> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error("SAP Service Layer is not configured");
  }

  const body = buildInventoryPostingBody(input);
  if (body.InventoryPostingLines.length === 0) {
    throw new Error("No inventory posting lines to send");
  }

  const response = await sapServiceLayerClient.request<{
    DocumentEntry?: number;
    DocEntry?: number;
    DocumentNumber?: number;
  }>({
    creds,
    method: "POST",
    path: "/InventoryPostings",
    body,
  });

  if (response.statusCode >= 400) {
    throw new Error(
      sapErrorMessage(response.statusCode, response.rawBody, "InventoryPostings"),
    );
  }

  const docEntry =
    response.data?.DocumentEntry ??
    response.data?.DocEntry ??
    response.data?.DocumentNumber;
  if (docEntry == null) {
    throw new Error("SAP Inventory Posting succeeded but returned no document reference");
  }
  return `IP-${docEntry}`;
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

  // Stand-in for Process II "Auto Create ITR/SO", then a copy toward IT/DR.
  // The document reference is not an inventory posting and does not move units.
  // ITR and SO are the SAP document names on the signed sheet. They are not
  // tagged here as Consignment or Outright.
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

/**
 * Process a queued Inventory Posting only when Service Layer is live.
 * Never fabricates a success doc ref.
 */
async function processInventoryPostingJob(
  tenantId: string,
  userId: string | undefined,
  job: SapIntegrationJob,
) {
  const payload = job.payload as unknown as InventoryPostingEmitInput;
  if (!payload?.sessionId || !Array.isArray(payload.lines)) {
    throw new Error("Invalid inventory posting payload");
  }

  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) {
    throw new Error(
      "SAP Service Layer is not configured — inventory posting remains pending until live credentials are available",
    );
  }

  const sapDocRef = await postInventoryPostingViaServiceLayer(tenantId, payload);

  const varianceIds = payload.lines.map((l) => l.varianceId).filter(Boolean);
  if (varianceIds.length > 0) {
    await prisma.stockVariance.updateMany({
      where: { id: { in: varianceIds }, tenantId },
      data: { sapDocRef, status: "closed" },
    });
  }

  const openLeft = await prisma.stockVariance.count({
    where: {
      tenantId,
      sessionId: payload.sessionId,
      status: { notIn: ["closed", "rejected"] },
    },
  });
  if (openLeft === 0) {
    await prisma.stockCountSession.updateMany({
      where: {
        id: payload.sessionId,
        tenantId,
        status: "adjustment_requested",
      },
      data: { status: "counting_complete" },
    });
  }

  await sapIntegrationRepository.markCompleted(job.id, sapDocRef);

  await auditService.log({
    tenantId,
    userId,
    action: "sap.inventory_posting_processed",
    entityType: "StockCountSession",
    entityId: payload.sessionId,
    metadata: { sapDocRef, jobId: job.id, varianceCount: varianceIds.length },
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
  listJobs(
    tenantId: string,
    pagination?: { page?: number; status?: string },
    sort?: { field?: SapJobListSort; dir?: SapJobListSortDir },
  ) {
    return sapIntegrationRepository.listJobs(tenantId, pagination, sort);
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

  /**
   * Legacy per-variance adjustment enqueue (kept for older jobs).
   * Prefer emitInventoryPosting for new P-Count posts.
   */
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

  /**
   * B1-shaped Inventory Posting for a P-Count session.
   * Posts live via Service Layer when configured; otherwise queues honestly (no mock success).
   */
  async emitInventoryPosting(
    tenantId: string,
    input: InventoryPostingEmitInput,
  ): Promise<InventoryPostingEmitResult> {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (creds) {
      try {
        const sapDocRef = await postInventoryPostingViaServiceLayer(tenantId, input);
        return {
          mode: "posted",
          sapDocRef,
          message: `Posted to SAP Inventory Posting (${sapDocRef})`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "SAP posting failed";
        const job = await enqueueJob({
          tenantId,
          jobType: "inventory_posting",
          idempotencyKey: `inventory_posting:${input.sessionId}`,
          referenceType: SAP_REFERENCE_TYPES.StockCountSession,
          referenceId: input.sessionId,
          payload: { ...input, lastError: message } as Record<string, unknown>,
        });
        return {
          mode: "queued",
          sapDocRef: null,
          jobId: job.id,
          message: `Local stock updated. SAP posting queued for retry: ${message}`,
        };
      }
    }

    const job = await enqueueJob({
      tenantId,
      jobType: "inventory_posting",
      idempotencyKey: `inventory_posting:${input.sessionId}`,
      referenceType: SAP_REFERENCE_TYPES.StockCountSession,
      referenceId: input.sessionId,
      payload: { ...input } as Record<string, unknown>,
    });

    return {
      mode: "queued",
      sapDocRef: null,
      jobId: job.id,
      message:
        "Local stock updated. SAP Inventory Posting is pending — connect Service Layer to complete live posting (no mock document created).",
    };
  },

  /** Process pending/failed jobs with retry handling. */
  async processPendingJobs(tenantId: string, userId?: string, limit = 10) {
    const jobs = await sapIntegrationRepository.claimPendingJobsSafe(tenantId, limit);
    const results: { jobId: string; status: string; sapDocRef?: string; error?: string }[] = [];

    for (const job of jobs) {
      const updated = job;
      try {
        let sapDocRef: string;
        switch (updated.jobType) {
          case "approved_order":
            sapDocRef = await processApprovedOrderJob(tenantId, userId, updated);
            break;
          case "inventory_posting":
            sapDocRef = await processInventoryPostingJob(tenantId, userId, updated);
            break;
          case "inventory_adjustment":
            throw new Error(
              "Legacy inventory_adjustment jobs no longer auto-complete with a mock SAP document. Re-post the count session or process via inventory_posting once Service Layer is connected.",
            );
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
          default: {
            const _exhaustive: never = updated.jobType;
            throw new Error(`Unsupported job type: ${_exhaustive}`);
          }
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

        results.push({
          jobId: job.id,
          status: deadLetter ? "dead_letter" : "failed",
          error: message,
        });
      }
    }

    return results;
  },
};
