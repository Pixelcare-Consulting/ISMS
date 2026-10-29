import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import { settleDeliveryAfterReturn } from "@/features/logistics/services/delivery-settle";
import { assertNotOnOpenTransfer } from "@/features/logistics/services/delivery-transfer-open-lines";
import { prisma } from "@/lib/database/client";

/** SAP document the return posted: Inventory Transfer (consignment) or Return (outright). */
export type DeliveryReturnSapKind = "IT" | "RETURN";

export const DELIVERY_RETURN_ENTITY = "DeliveryReturnRequest";

/**
 * Local half of an approved return, run once SAP has the document. One
 * transaction: the in-transit branch rows go, each unit lands at the warehouse
 * location it was dispatched from, the request completes and the delivery settles
 * (closed, or still partial while other units are in transit).
 *
 * A unit dispatched from SAP's placement has no location. It gets no ISMS stock row:
 * it is linked back to the delivery's source warehouse as SAP now holds it, so dispatch
 * can offer it again without waiting for the next serial sync.
 *
 * Called by the SAP adapters (live and mock); a second call is a no-op.
 */
export async function completeDeliveryReturn(input: {
  tenantId: string;
  userId?: string;
  returnId: string;
  kind: DeliveryReturnSapKind;
  sapDocNo: string;
}): Promise<{ deliveryStatus: "accepted" | "partial" | "rejected" } | null> {
  const { tenantId, returnId } = input;
  return prisma.$transaction(async (tx) => {
    const request = await tx.deliveryReturnRequest.findFirst({
      where: { id: returnId, tenantId },
      select: {
        status: true,
        requestNo: true,
        deliveryId: true,
        delivery: {
          select: { branchId: true, sourceWarehouse: { select: { code: true, deletedAt: true } } },
        },
        lines: { select: { serialNumberId: true, warehouseLocationToId: true } },
      },
    });
    if (!request) throw new Error("Return request not found");
    if (request.status === "COMPLETED") return null;
    if (request.status !== "APPROVED") throw new Error("Only an approved return can be completed");
    if (request.lines.length === 0) throw new Error("This return has no units");

    const serialIds = request.lines.map((line) => line.serialNumberId);
    await lockSerialNumbers(tx, serialIds);
    // A unit on an open unit transfer is settled by that transfer; never move it from under it.
    await assertNotOnOpenTransfer(tx, tenantId, serialIds);
    const placements = await loadCurrentPlacements(tx, serialIds);
    assertExclusivePlacement({
      placements,
      replacingIds: placements
        .filter(
          (row) => row.table === "branch" && row.branchId === request.delivery.branchId && row.statusCode === "DIT",
        )
        .map((row) => row.id),
    });

    const removed = await tx.branchInventory.deleteMany({
      where: {
        tenantId,
        branchId: request.delivery.branchId,
        serialNumberId: { in: serialIds },
        statusCode: { code: "DIT" },
      },
    });
    assertExclusiveClaim(removed.count, serialIds.length, "Some units are no longer in transit at the branch");

    const now = new Date();
    const toLocation = request.lines.flatMap((line) =>
      line.warehouseLocationToId
        ? [{ serialNumberId: line.serialNumberId, warehouseLocationId: line.warehouseLocationToId }]
        : [],
    );
    const toSapWarehouse = request.lines
      .filter((line) => !line.warehouseLocationToId)
      .map((line) => line.serialNumberId);

    if (toLocation.length > 0) {
      await tx.warehouseInventory.createMany({
        data: toLocation.map((line) => ({
          tenantId,
          ...line,
          systemStatus: "Returned from delivery",
          systemUpdatedAt: now,
        })),
      });
    }
    if (toSapWarehouse.length > 0) {
      const source = request.delivery.sourceWarehouse;
      if (!source || source.deletedAt) {
        throw new Error("This delivery's source warehouse is no longer in ISMS, so the units cannot be returned to it");
      }
      await tx.serialNumber.updateMany({
        where: { tenantId, id: { in: toSapWarehouse } },
        data: { sapWhsCode: source.code, sapOnHand: true, sapOnHandSyncedAt: now },
      });
    }
    await tx.serialNumberHistory.createMany({
      data: serialIds.map((serialNumberId) => ({
        tenantId,
        serialNumberId,
        txnType: "return" as const,
        details: `Returned to warehouse on ${request.requestNo} (SAP ${input.kind} ${input.sapDocNo})`,
        status: "Warehouse",
        createdById: input.userId ?? null,
      })),
    });

    const claimed = await tx.deliveryReturnRequest.updateMany({
      where: { id: returnId, tenantId, status: "APPROVED" },
      data: { status: "COMPLETED" },
    });
    assertExclusiveClaim(claimed.count, 1, "This return was updated by someone else");

    const deliveryStatus = await settleDeliveryAfterReturn(tx, tenantId, request.deliveryId);

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: input.userId ?? null,
        action: "delivery_return.completed",
        entityType: DELIVERY_RETURN_ENTITY,
        entityId: returnId,
        metadata: {
          requestNo: request.requestNo,
          deliveryId: request.deliveryId,
          serialNumberIds: serialIds,
          sapKind: input.kind,
          sapDocNo: input.sapDocNo,
          deliveryStatus,
        },
      },
    });
    return { deliveryStatus };
  });
}
