import { auditService } from "@/features/audit/services/audit.service";
import { logisticsService } from "@/features/logistics/services/logistics.service";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { resolveOrderSapRouting } from "@/features/orders/services/order-sap-routing";
import type { SapOutboundPort } from "@/features/sap/ports/sap-outbound.port";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { prisma } from "@/lib/database/client";
import type { SapIntegrationJob } from "@prisma/client";

function mockSapDocRef(jobType: string, referenceId: string) {
  return `SAP-${jobType.toUpperCase().slice(0, 3)}-${referenceId.slice(-8).toUpperCase()}`;
}

async function completeStub(
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

  if (
    job.referenceType === SAP_REFERENCE_TYPES.BranchDelivery &&
    job.referenceId &&
    job.jobType === "delivery_partial_return"
  ) {
    await prisma.branchDelivery.update({
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
    metadata: { sapDocRef, jobId: job.id, stub: true, adapter: "mock" },
  });

  return sapDocRef;
}

/**
 * Default outbound adapter: mock document refs + open local BranchDelivery.
 * Behavior matches the pre-port processApprovedOrder / stub processors.
 */
export const mockSapOutbound: SapOutboundPort = {
  async createApprovedOrderDocument({ tenantId, userId, job }) {
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

    // Process II stand-in for ITR (OWTQ) + SO (ORDR). Does not move stock.
    // III.A entry: opens local BranchDelivery; live OWTR/ODLN refs come later.
    const sapDocRef = mockSapDocRef("approved_order", orderId);

    await prisma.branchOrder.update({
      where: { id: orderId },
      data: { sapDocRef },
    });

    let delivery = await prisma.branchDelivery.findFirst({
      where: { tenantId, orderId },
    });

    if (!delivery && userId) {
      const ctx = await orderRepository.findSapRoutingContext(tenantId, order.branchId);
      const routing = ctx.branch
        ? resolveOrderSapRouting({
            branch: ctx.branch,
            mainWarehouse: ctx.mainWarehouse,
            dealer: ctx.branch.dealer,
          })
        : null;
      delivery = await logisticsService.createDeliveryFromApprovedOrder(
        tenantId,
        userId,
        {
          id: order.id,
          branchId: order.branchId,
          branchName: order.branch.name,
          orderNumber: order.orderNumber,
        },
        { sourceWarehouseId: routing?.ok ? routing.sourceWarehouseId : null },
      );
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
        adapter: "mock",
        documents: ["ITR/OWTQ", "SO/ORDR"],
      },
    });

    return sapDocRef;
  },

  async createPulloutItr({ tenantId, userId, job }) {
    return completeStub(tenantId, userId, job, SAP_REFERENCE_TYPES.BranchPullout);
  },

  async createPartialDeliveryInventoryTransfer({ tenantId, userId, job }) {
    return completeStub(tenantId, userId, job, SAP_REFERENCE_TYPES.BranchDelivery);
  },

  async createDispatchDocument({ deliveryId }) {
    const tail = deliveryId.slice(-8).toUpperCase();
    return {
      docEntry: 1,
      docNum: 1,
      docDate: new Date().toISOString().slice(0, 10),
      displayNo: `MOCK-DR-${tail}`,
      lineNums: [],
    };
  },

  async createDeliveryReturnDocument({ tenantId, userId, job }) {
    return completeStub(tenantId, userId, job, SAP_REFERENCE_TYPES.BranchDelivery);
  },

  async createDeliveryTransferDocument({ tenantId, userId, job }) {
    return completeStub(tenantId, userId, job, SAP_REFERENCE_TYPES.BranchDelivery);
  },
};
