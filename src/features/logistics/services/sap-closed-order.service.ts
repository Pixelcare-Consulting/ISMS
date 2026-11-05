import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import { lockDeliveryRow, txWorkflowCodeId } from "@/features/logistics/services/delivery-settle";
import { notifyCopyToAttention } from "@/features/logistics/services/sap-copy-to-follow.notifier";
import {
  CLOSED_SALES_ORDER_KIND,
  SAP_FOLLOW_STATUS,
} from "@/features/logistics/services/sap-copy-to-follow.planner";
import { DELIVERY_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

const CHANGED = "This delivery changed. Reload and try again.";

/**
 * Settles a delivery whose SAP-made SO was closed or cancelled in SAP without a DR: the
 * order becomes Cancelled, the empty delivery Rejected, and the flagged entry Resolved,
 * which also clears the logistics notification. Only a delivery with no units qualifies.
 */
export async function closeOrderClosedInSap(
  actor: PostingActor,
  deliveryId: string,
): Promise<{ orderNumber: string }> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId: actor.tenantId },
    select: {
      id: true,
      branchId: true,
      sourceWarehouseId: true,
      order: { select: { id: true, orderNumber: true } },
      sapDocuments: {
        where: { docKind: CLOSED_SALES_ORDER_KIND, status: SAP_FOLLOW_STATUS.FLAGGED },
        select: { id: true, displayNo: true },
      },
    },
  });
  if (!delivery?.order) throw new Error("Delivery not found");
  await authorizeDeliveryScope(actor, delivery);
  const flagged = delivery.sapDocuments[0];
  if (!flagged) throw new Error("SAP has not reported this order's SO as closed without a DR.");
  const order = delivery.order;

  await prisma.$transaction(async (tx) => {
    await lockDeliveryRow(tx, actor.tenantId, delivery.id);
    const units = await tx.branchDeliveryLine.count({ where: { deliveryId: delivery.id } });
    if (units > 0) throw new Error("This delivery already has units, so it cannot be closed here.");
    const rejectedId = await txWorkflowCodeId(tx, actor.tenantId, DELIVERY_WORKFLOW_CODE.rejected);
    const approvedId = await txWorkflowCodeId(tx, actor.tenantId, DELIVERY_WORKFLOW_CODE.approved);

    const closedDelivery = await tx.branchDelivery.updateMany({
      where: { id: delivery.id, tenantId: actor.tenantId, statusCodeId: approvedId },
      data: { statusCodeId: rejectedId },
    });
    assertExclusiveClaim(closedDelivery.count, 1, CHANGED);
    const cancelledOrder = await tx.branchOrder.updateMany({
      where: { id: order.id, tenantId: actor.tenantId, status: "approved" },
      data: { status: "cancelled" },
    });
    assertExclusiveClaim(cancelledOrder.count, 1, CHANGED);
    await tx.deliverySapDocument.update({
      where: { id: flagged.id },
      data: { status: SAP_FOLLOW_STATUS.RESOLVED },
    });
    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: "order.closed_after_sap_so_closed",
        entityType: "BranchOrder",
        entityId: order.id,
        metadata: { orderNumber: order.orderNumber, deliveryId: delivery.id, sapSoNum: flagged.displayNo },
      },
    });
  });

  try {
    await notifyCopyToAttention(actor.tenantId);
  } catch (e) {
    // The next SAP check refreshes the notification anyway.
    logger.error(
      { tenantId: actor.tenantId, err: e instanceof Error ? e.message : e },
      "close order closed in SAP: attention notification refresh failed",
    );
  }
  return { orderNumber: order.orderNumber };
}
