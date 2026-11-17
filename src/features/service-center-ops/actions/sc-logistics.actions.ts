"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import {
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { placeServiceCenterUnit } from "@/features/service-center-ops/services/service-center-placement";
import { holdSpecialOrderUnitForReturn } from "@/features/service-center-ops/services/sc-service-return.service";
import { notifyScSpecialOrderOutcome } from "@/features/service-center-ops/services/sc-service-return-notify";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
  SC_LOGISTICS_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";
import { scOpsRepository } from "@/features/service-center-ops/repositories/sc-ops.repository";
import {
  blockedPlacementMessage,
  scDeliveryStatusAfterAccept,
  scPlacementsToReplace,
} from "@/features/service-center-ordering/lib/sc-order-sap-check";
import {
  assertScInScope,
  resolveScIdsForUser,
} from "@/features/service-center-ops/services/sc-scope";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

function revalidateScLogistics() {
  revalidatePath("/service-centers/deliveries");
  revalidatePath("/service-centers/pullouts");
  revalidatePath("/service-centers/orders");
  revalidatePath("/service-centers/inventory");
}

export async function listScDeliveriesAction(input?: {
  page?: number;
  limit?: number;
}) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_VIEW,
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  return scOpsRepository.listDeliveries(session.user.tenantId, scopedIds, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });
}

const acceptDeliverySchema = z.object({
  serialNumberIds: z.array(z.string().min(1)).min(1),
  /** For a SAP DR delivery whose order named no location (the center has several). */
  serviceCenterLocationId: z.string().min(1).optional().nullable(),
});

/**
 * Receives units at the service center as STK. A delivery made from a SAP DR accepts its own
 * DR serials (DIT at the location, or still at the warehouse when no location was known).
 * An older ISMS-made delivery has no serial list, so the user supplies the serials.
 */
export async function acceptScDeliveryAction(
  deliveryId: string,
  input: unknown,
) {
  const session = await requireAnyPermission([
    SC_LOGISTICS_CREATE,
    SC_LOGISTICS_MANAGE,
  ]);
  const parsed = acceptDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Provide at least one serial number" as const };
  }
  const tenantId = session.user.tenantId;
  const serialNumberIds = [...new Set(parsed.data.serialNumberIds)];

  const delivery = await prisma.serviceCenterDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    include: { lines: { select: { serialNumberId: true, acceptedAt: true } } },
  });
  if (!delivery) return { error: "Delivery not found" as const };

  const scopedIds = await resolveScIdsForUser(
    tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(delivery.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" as const };
  }

  const fromSap = delivery.lines.length > 0;
  const locationId = delivery.serviceCenterLocationId ?? (fromSap ? parsed.data.serviceCenterLocationId : null);
  if (!locationId) {
    return {
      error: fromSap
        ? "Choose the service center location that receives these units"
        : "Delivery has no service center location",
    };
  }
  if (!delivery.serviceCenterLocationId) {
    const location = await prisma.serviceCenterLocation.findFirst({
      where: { id: locationId, serviceCenterId: delivery.serviceCenterId },
      select: { id: true },
    });
    if (!location) return { error: "That location is not at this service center" as const };
  }

  if (fromSap) {
    const open = new Set(
      delivery.lines.filter((line) => line.acceptedAt === null).map((line) => line.serialNumberId),
    );
    if (serialNumberIds.some((id) => !open.has(id))) {
      return { error: "Only serials on this SAP delivery that are not yet accepted can be accepted" as const };
    }
  } else {
    const serials = await prisma.serialNumber.count({
      where: { id: { in: serialNumberIds }, tenantId },
    });
    if (serials !== serialNumberIds.length) {
      return { error: "One or more serials not found" as const };
    }
  }

  const [acceptedCodeId, partialCodeId, stkCodeId] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "delivery_workflow", "accepted"),
    reasonStatusService.requireCodeId(tenantId, "delivery_workflow", "partial"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "STK"),
  ]);

  let heldForReturn: Awaited<ReturnType<typeof holdSpecialOrderUnitForReturn>> = null;
  try {
    await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, serialNumberIds);
      if (fromSap) {
        // Units with no location at Check SAP still have ISMS's warehouse row; the DR moved
        // them out of SAP's warehouse, so that row goes now.
        const placements = (await loadCurrentPlacements(tx, serialNumberIds)).filter(
          (row) => row.tenantId === tenantId,
        );
        const { warehouseRowIds, blocked } = scPlacementsToReplace(placements, locationId);
        if (blocked.length > 0) throw new Error(blockedPlacementMessage(blocked));
        if (warehouseRowIds.length > 0) {
          await tx.warehouseInventory.deleteMany({ where: { id: { in: warehouseRowIds } } });
        }
      }
      for (const serialNumberId of serialNumberIds) {
        await tx.serviceBackload.create({
          data: {
            tenantId,
            serviceCenterId: delivery.serviceCenterId,
            serviceCenterLocationId: locationId,
            deliveryId: delivery.id,
            serialNumberId,
          },
        });
        await placeServiceCenterUnit(tx, {
          tenantId,
          serviceCenterId: delivery.serviceCenterId,
          serviceCenterLocationId: locationId,
          serialNumberId,
          statusCodeId: stkCodeId,
        });
      }

      let statusCodeId = acceptedCodeId;
      if (fromSap) {
        await tx.serviceCenterDeliveryLine.updateMany({
          where: { deliveryId, serialNumberId: { in: serialNumberIds }, acceptedAt: null },
          data: { acceptedAt: new Date() },
        });
        const lines = await tx.serviceCenterDeliveryLine.findMany({
          where: { deliveryId },
          select: { acceptedAt: true },
        });
        statusCodeId = scDeliveryStatusAfterAccept(lines) === "accepted" ? acceptedCodeId : partialCodeId;
      }
      await tx.serviceCenterDelivery.update({
        where: { id: deliveryId },
        data: { statusCodeId, serviceCenterLocationId: locationId },
      });
      // A special order raised by a Service Replacement: hold its unit for that request.
      heldForReturn = await holdSpecialOrderUnitForReturn(tx, {
        tenantId,
        orderId: delivery.orderId,
        acceptedSerialNumberIds: serialNumberIds,
      });
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to accept delivery",
    } as const;
  }

  await auditService.log({
    tenantId,
    userId: session.user.id,
    action: "sc_delivery.accepted",
    entityType: "ServiceCenterDelivery",
    entityId: deliveryId,
    metadata: {
      deliveryNo: delivery.deliveryNo,
      serialCount: serialNumberIds.length,
      drNo: delivery.sapDocNo,
    },
  });

  const held = heldForReturn as Awaited<ReturnType<typeof holdSpecialOrderUnitForReturn>>;
  if (held) {
    await notifyScSpecialOrderOutcome({
      tenantId,
      actorUserId: session.user.id,
      returnRequestId: held.returnRequestId,
      serviceCenterId: held.serviceCenterId,
      transactionNo: held.transactionNo,
      orderNumber: held.orderNumber,
      outcome: "DELIVERED",
    });
    revalidatePath("/service-centers/returns");
  }

  revalidateScLogistics();
  return {
    success: true as const,
    movedCount: serialNumberIds.length,
  };
}
