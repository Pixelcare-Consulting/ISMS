import { Prisma } from "@/lib/database/generated/prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";

type DbClient = Pick<typeof prisma, "branchDelivery">;

function nextDeliveryNo() {
  return `DLV-${Date.now().toString(36).toUpperCase()}`;
}

export const logisticsService = {
  /**
   * Signed Process II → III.A entry: Manual → Pending SP (TL may optionally
   * edit); Special TL→SP; Auto TL→SP. SP approval queues the approved_order
   * job, which posts the live SAP ITR (OWTQ, consignment) or SO (ORDR,
   * outright) and then opens this delivery header as Approved with its source
   * warehouse. It does not move stock: Logistics dispatches warehouse serials
   * later, posting the Inventory Transfer (OWTR) or Delivery Note (ODLN).
   */
  async createDeliveryFromApprovedOrder(
    tenantId: string,
    userId: string,
    order: { id: string; branchId: string; branchName: string; orderNumber: string },
    options: { sourceWarehouseId?: string | null; tx?: DbClient; statusCodeId?: string } = {},
  ) {
    const db = options.tx ?? prisma;
    const existing = await db.branchDelivery.findFirst({
      where: { tenantId, orderId: order.id },
    });
    if (existing) return existing;

    // Callers inside a transaction pass the id so no other connection is used mid-tx.
    const statusCodeId =
      options.statusCodeId ??
      (await reasonStatusService.requireCodeId(tenantId, "delivery_workflow", "approved"));

    let row;
    try {
      row = await db.branchDelivery.create({
        data: {
          tenantId,
          branchId: order.branchId,
          orderId: order.id,
          deliveryNo: nextDeliveryNo(),
          statusCodeId,
          sourceWarehouseId: options.sourceWarehouseId ?? null,
        },
        include: { branch: { select: { name: true } } },
      });
    } catch (e) {
      // Unique (tenantId, orderId) violation → a concurrent run already created
      // the delivery. Return the existing one instead of failing.
      // Inside a caller's transaction a failed statement aborts it, so only recover standalone.
      if (!options.tx && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const created = await prisma.branchDelivery.findFirst({
          where: { tenantId, orderId: order.id },
        });
        if (created) return created;
      }
      throw e;
    }

    // With a caller transaction the caller logs this audit after commit.
    if (options.tx) return row;

    await auditService.log({
      tenantId,
      userId,
      action: "delivery.created_from_order",
      entityType: "BranchDelivery",
      entityId: row.id,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        deliveryNo: row.deliveryNo,
        branchName: row.branch.name,
      },
    });

    return row;
  },
};
