import type { Prisma } from "@/lib/database/generated/prisma/client";

import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { SC_DR_TRANSACTION_OPTIONS } from "@/features/service-center-ops/services/service-center-placement";
import { scDeliverySettledStatus } from "@/features/service-center-ordering/lib/sc-order-sap-check";
import { prisma } from "@/lib/database/client";

export const SC_DELIVERY_RETURN_ENTITY = "ServiceCenterDeliveryReturnRequest";

/** Warehouse stock has no status code, so a unit marked defective carries DEF as its system status. */
const DEFECTIVE_STATUS = "DEF";

/** Serialises settles of one SC delivery (an accept and a completed reject at once). */
export async function lockScDeliveryRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  deliveryId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM service_center_deliveries WHERE id = ${deliveryId} AND tenant_id = ${tenantId} FOR UPDATE
  `;
}

/**
 * Local half of an SC reject, run once SAP has the Return. One transaction: the units leave the
 * service center (their DIT row there goes), SAP's warehouse holds them again, the DR lines are
 * marked returned, the request completes and the delivery settles (partial while other units are
 * in transit, rejected when every unit went back, else accepted).
 *
 * A DR whose order named no location left its units on ISMS's warehouse row until receipt; that
 * row stays, as the unit never left. Every unit is linked back to the order's SAP warehouse so it
 * can be ordered again without waiting for the next serial sync.
 *
 * Called by the SAP adapters (live and mock); a second call is a no-op.
 */
export async function completeScDeliveryReturn(input: {
  tenantId: string;
  userId?: string;
  returnId: string;
  sapDocNo: string;
}): Promise<{ deliveryStatus: "accepted" | "partial" | "rejected" } | null> {
  const { tenantId, returnId } = input;
  const codes = await Promise.all(
    (["accepted", "partial", "rejected"] as const).map(async (code) => [
      code,
      await reasonStatusService.requireCodeId(tenantId, "delivery_workflow", code),
    ] as const),
  );
  const statusCodeIds = Object.fromEntries(codes) as Record<"accepted" | "partial" | "rejected", string>;

  return prisma.$transaction(async (tx) => {
    const request = await tx.serviceCenterDeliveryReturnRequest.findFirst({
      where: { id: returnId, tenantId },
      select: {
        status: true,
        requestNo: true,
        deliveryId: true,
        delivery: {
          select: {
            deliveryNo: true,
            serviceCenterId: true,
            order: { select: { sapWarehouseCode: true } },
          },
        },
        lines: { select: { serialNumberId: true, markDefective: true } },
      },
    });
    if (!request) throw new Error("Reject request not found");
    if (request.status === "COMPLETED") return null;
    if (request.status !== "APPROVED") throw new Error("Only an approved reject can be completed");
    if (request.lines.length === 0) throw new Error("This reject has no units");
    const sapWarehouseCode = request.delivery.order?.sapWarehouseCode;
    if (!sapWarehouseCode) throw new Error("The SC order has no SAP warehouse stored");

    const serialIds = request.lines.map((line) => line.serialNumberId);
    await lockSerialNumbers(tx, serialIds);
    await lockScDeliveryRow(tx, tenantId, request.deliveryId);

    const open = await tx.serviceCenterDeliveryLine.count({
      where: {
        deliveryId: request.deliveryId,
        serialNumberId: { in: serialIds },
        acceptedAt: null,
        returnedAt: null,
      },
    });
    assertExclusiveClaim(open, serialIds.length, "Some rejected units were received or returned meanwhile");

    const placements = (await loadCurrentPlacements(tx, serialIds)).filter((row) => row.tenantId === tenantId);
    const scTransitRows = placements.filter(
      (row) =>
        row.table === "service_center" &&
        row.serviceCenterId === request.delivery.serviceCenterId &&
        row.statusCode === "DIT",
    );
    const warehouseRows = placements.filter((row) => row.table === "warehouse");
    // Anything else (branch stock, another center) means the unit moved; never take it from there.
    assertExclusivePlacement({
      placements,
      replacingIds: [...scTransitRows, ...warehouseRows].map((row) => row.id),
    });

    if (scTransitRows.length > 0) {
      await tx.serviceCenterInventory.deleteMany({ where: { id: { in: scTransitRows.map((row) => row.id) } } });
    }
    const defectiveIds = new Set(request.lines.filter((line) => line.markDefective).map((line) => line.serialNumberId));
    const now = new Date();
    const defectiveWarehouseRows = warehouseRows.filter((row) => defectiveIds.has(row.serialNumberId));
    if (defectiveWarehouseRows.length > 0) {
      await tx.warehouseInventory.updateMany({
        where: { id: { in: defectiveWarehouseRows.map((row) => row.id) } },
        data: { systemStatus: DEFECTIVE_STATUS, systemUpdatedAt: now },
      });
    }
    await tx.serialNumber.updateMany({
      where: { tenantId, id: { in: serialIds } },
      data: { sapWhsCode: sapWarehouseCode, sapOnHand: true, sapOnHandSyncedAt: now },
    });
    await tx.serialNumberHistory.createMany({
      data: request.lines.map((line) => ({
        tenantId,
        serialNumberId: line.serialNumberId,
        txnType: "return" as const,
        details: `Rejected at service center on ${request.requestNo}, back to SAP warehouse ${sapWarehouseCode} (SAP Return ${input.sapDocNo})`,
        status: line.markDefective ? DEFECTIVE_STATUS : "Warehouse",
        createdById: input.userId ?? null,
      })),
    });
    await tx.serviceCenterDeliveryLine.updateMany({
      where: { deliveryId: request.deliveryId, serialNumberId: { in: serialIds } },
      data: { returnedAt: now },
    });

    const claimed = await tx.serviceCenterDeliveryReturnRequest.updateMany({
      where: { id: returnId, tenantId, status: "APPROVED" },
      data: { status: "COMPLETED" },
    });
    assertExclusiveClaim(claimed.count, 1, "This reject was updated by someone else");

    const deliveryLines = await tx.serviceCenterDeliveryLine.findMany({
      where: { deliveryId: request.deliveryId },
      select: { acceptedAt: true, returnedAt: true },
    });
    const deliveryStatus = scDeliverySettledStatus(deliveryLines);
    await tx.serviceCenterDelivery.update({
      where: { id: request.deliveryId },
      data: { statusCodeId: statusCodeIds[deliveryStatus] },
    });

    const metadata = {
      requestNo: request.requestNo,
      deliveryId: request.deliveryId,
      deliveryNo: request.delivery.deliveryNo,
      serialNumberIds: serialIds,
      sapDocNo: input.sapDocNo,
      deliveryStatus,
    };
    await tx.auditLog.createMany({
      data: [
        {
          tenantId,
          userId: input.userId ?? null,
          action: "sc_delivery_return.completed",
          entityType: SC_DELIVERY_RETURN_ENTITY,
          entityId: returnId,
          metadata,
        },
        // On the delivery too, so its progress history shows the reject.
        {
          tenantId,
          userId: input.userId ?? null,
          action: "sc_delivery.rejected",
          entityType: "ServiceCenterDelivery",
          entityId: request.deliveryId,
          metadata,
        },
      ],
    });
    return { deliveryStatus };
  }, SC_DR_TRANSACTION_OPTIONS);
}
