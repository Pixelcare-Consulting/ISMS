import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";

function nextDeliveryNo() {
  return `DLV-${Date.now().toString(36).toUpperCase()}`;
}

export const logisticsService = {
  /** Process Flow II: approved order → SAP ITR/SO → delivery synced to ISMS (MVP: auto-create pending delivery). */
  async createDeliveryFromApprovedOrder(
    tenantId: string,
    userId: string,
    order: { id: string; branchId: string; orderNumber: string },
  ) {
    const existing = await prisma.branchDelivery.findFirst({
      where: { tenantId, orderId: order.id },
    });
    if (existing) return existing;

    const statusCodeId = await reasonStatusService.requireCodeId(
      tenantId,
      "delivery_workflow",
      "pending",
    );

    const row = await prisma.branchDelivery.create({
      data: {
        tenantId,
        branchId: order.branchId,
        orderId: order.id,
        deliveryNo: nextDeliveryNo(),
        statusCodeId,
      },
    });

    await auditService.log({
      tenantId,
      userId,
      action: "delivery.created_from_order",
      entityType: "BranchDelivery",
      entityId: row.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    return row;
  },
};
