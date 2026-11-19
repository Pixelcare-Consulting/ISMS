"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import {
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import {
  placeServiceCenterUnits,
  SC_DR_TRANSACTION_OPTIONS,
} from "@/features/service-center-ops/services/service-center-placement";
import { holdSpecialOrderUnitForReturn } from "@/features/service-center-ops/services/sc-service-return.service";
import { notifyScSpecialOrderOutcome } from "@/features/service-center-ops/services/sc-service-return-notify";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  SC_LOGISTICS_ACTION_CAPABILITIES,
  SC_LOGISTICS_CREATE,
  SC_LOGISTICS_MANAGE,
  SC_LOGISTICS_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";
import { checkScOrdersInSap } from "@/features/service-center-ordering/services/sc-order-sap-check.service";
import {
  SC_DELIVERY_LIST_SORTS,
  scOpsRepository,
} from "@/features/service-center-ops/repositories/sc-ops.repository";
import { scDeliveryHistory } from "@/features/service-center-ops/lib/sc-delivery-detail";
import {
  isOpenScReturn,
  isScLineInTransit,
  scDeliveryReceiptLines,
  SC_OPEN_RETURN_STATUSES,
  SC_RETURN_ALREADY_OPEN_ERROR,
  type ScDeliveryUnit,
} from "@/features/service-center-ops/lib/sc-delivery-return";
import { lockScDeliveryRow } from "@/features/service-center-ops/services/sc-delivery-return-completion";
import { scDeliveryReturnService } from "@/features/service-center-ops/services/sc-delivery-return.service";
import {
  deliveryReturnCancelNoteSchema,
  deliveryReturnReasonSchema,
  deliveryReturnUnitsSchema,
  type DeliveryReturnDetail,
  type DeliveryReturnOutcome,
} from "@/features/logistics/services/delivery-return.service";
import type { LogisticsKpis } from "@/features/logistics/actions/logistics.actions";
import {
  blockedPlacementMessage,
  scDeliverySettledStatus,
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

/**
 * Finds the DRs SAP users copied from approved SC orders' Sales Orders and makes each one an
 * SC delivery, its serials DIT at the order's location, ready to accept.
 */
export async function checkScOrdersInSapAction() {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACTION_CAPABILITIES.canCheckSap]);
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    const result = await checkScOrdersInSap(session.user.tenantId, session.user.id, scopedIds);
    revalidateScLogistics();
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not check SAP" };
  }
}

export async function listScDeliveriesAction(input?: {
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: string;
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
  const field = SC_DELIVERY_LIST_SORTS.find((sort) => sort === input?.sort);
  return scOpsRepository.listDeliveries(
    session.user.tenantId,
    scopedIds,
    { page: input?.page, limit: parseTablePageSize(input?.limit) },
    { field, dir: input?.sortDir === "asc" ? "asc" : "desc" },
  );
}

const SC_LOGISTICS_PAGE_PERMISSIONS = [SC_LOGISTICS_VIEW, SC_LOGISTICS_CREATE, SC_LOGISTICS_MANAGE];

/** Deliveries per Delivery workflow status, for the KPI strip (same shape as branch deliveries). */
export async function getScDeliveryKpisAction(): Promise<LogisticsKpis> {
  const session = await requireAnyPermission(SC_LOGISTICS_PAGE_PERMISSIONS);
  const tenantId = session.user.tenantId;
  const scopedIds = await resolveScIdsForUser(tenantId, session.user.id, session.user.permissions);
  const [codes, groups] = await Promise.all([
    reasonStatusService.listActiveCodes(tenantId, "delivery_workflow"),
    scOpsRepository.countDeliveriesByStatus(tenantId, scopedIds),
  ]);
  const countByCodeId = new Map(groups.map((group) => [group.statusCodeId, group._count.id]));
  return {
    total: groups.reduce((sum, group) => sum + group._count.id, 0),
    statuses: codes.map((code) => ({
      code: code.code,
      name: code.name,
      color: code.color,
      sortOrder: code.sortOrder,
      count: countByCodeId.get(code.id) ?? 0,
    })),
  };
}

type ScopedDelivery =
  | { error: string }
  | { found: NonNullable<Awaited<ReturnType<typeof scOpsRepository.findDeliveryDetail>>> };

async function loadScopedDelivery(deliveryId: string): Promise<ScopedDelivery> {
  const session = await requireAnyPermission(SC_LOGISTICS_PAGE_PERMISSIONS);
  const found = await scOpsRepository.findDeliveryDetail(session.user.tenantId, deliveryId);
  if (!found) return { error: "Delivery not found" };
  const scopedIds = await resolveScIdsForUser(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  try {
    assertScInScope(found.delivery.serviceCenterId, scopedIds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Out of scope" };
  }
  return { found };
}

type FoundDelivery = Extract<ScopedDelivery, { found: unknown }>["found"]["delivery"];

/** The DR's units with their accept, return, and open reject. */
function deliveryUnits(delivery: FoundDelivery): ScDeliveryUnit[] {
  const openReturnBySerial = new Map<string, { id: string; requestNo: string }>();
  for (const request of delivery.returnRequests) {
    if (!isOpenScReturn(request.status)) continue;
    for (const line of request.lines) {
      openReturnBySerial.set(line.serialNumberId, { id: request.id, requestNo: request.requestNo });
    }
  }
  return delivery.lines.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    skuCode: line.serialNumber.model.skuCode,
    modelName: line.serialNumber.model.name,
    acceptedAt: line.acceptedAt,
    returnedAt: line.returnedAt,
    openReturn: openReturnBySerial.get(line.serialNumberId) ?? null,
  }));
}

/** One SC delivery for its detail page: DR, order, units, rejects, and progress history. */
export async function getScDeliveryDetailAction(deliveryId: string) {
  const loaded = await loadScopedDelivery(deliveryId);
  if ("error" in loaded) return { error: loaded.error };
  const { delivery, audits } = loaded.found;
  const units = deliveryUnits(delivery);
  return {
    success: true as const,
    detail: {
      id: delivery.id,
      deliveryNo: delivery.deliveryNo,
      serviceCenterName: delivery.serviceCenter.name,
      locations: delivery.serviceCenter.locations,
      location: delivery.serviceCenterLocation,
      status: delivery.statusCode ?? { code: "pending", name: "Pending", color: null },
      orderNumber: delivery.order?.orderNumber ?? null,
      sapSoNum: delivery.order?.sapDocNum ?? null,
      drNo: delivery.sapDocNo,
      drDate: delivery.sapDocDate?.toISOString() ?? null,
      /** A SAP DR from an SC order: its units can be rejected back to SAP. */
      canRejectUnits: delivery.order !== null && delivery.lines.length > 0,
      units: units.map((unit) => ({
        ...unit,
        acceptedAt: unit.acceptedAt?.toISOString() ?? null,
        returnedAt: unit.returnedAt?.toISOString() ?? null,
      })),
      returns: delivery.returnRequests.map((request) => ({
        id: request.id,
        requestNo: request.requestNo,
        status: request.status,
        sapDocNo: request.sapDocNo,
        sapError: request.sapError,
        remarks: request.reason,
        unitCount: request.lines.length,
      })),
      history: scDeliveryHistory({
        deliveryId: delivery.id,
        createdAt: delivery.createdAt,
        orderApprovedAt: delivery.order?.approvalLevels[0]?.approvedAt ?? null,
        audits: audits.map((audit) => ({
          id: audit.id,
          action: audit.action,
          createdAt: audit.createdAt,
          userName: audit.user?.name ?? null,
        })),
      }),
    },
  };
}

export type ScDeliveryDetail = Extract<
  Awaited<ReturnType<typeof getScDeliveryDetailAction>>,
  { success: true }
>["detail"];

/** The DR's units for the branch receive dialog. */
export async function listScDeliveryReceiptLinesAction(deliveryId: string) {
  const loaded = await loadScopedDelivery(deliveryId);
  if ("error" in loaded) return { error: loaded.error };
  const { delivery } = loaded.found;
  return {
    success: true as const,
    status: delivery.statusCode?.code ?? "pending",
    lines: scDeliveryReceiptLines(deliveryUnits(delivery)),
  };
}

function returnActor(session: Awaited<ReturnType<typeof requireAnyPermission>>) {
  return { tenantId: session.user.tenantId, userId: session.user.id, permissions: session.user.permissions };
}

function revalidateScDelivery(deliveryId: string) {
  revalidateScLogistics();
  revalidatePath(`/service-centers/deliveries/${deliveryId}`);
  revalidatePath("/inventory-approvals");
}

/**
 * Rejects ticked DR units at receipt. Approved on the spot; ISMS posts the SAP Return now and,
 * once SAP has it, the units go back to the order's SAP warehouse.
 */
export async function requestScDeliveryReturnAction(
  deliveryId: string,
  remarks: unknown,
  units: unknown,
): Promise<({ success: true; id: string; requestNo: string } & DeliveryReturnOutcome) | { error: string }> {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACTION_CAPABILITIES.canRejectDelivery]);
  const parsed = deliveryReturnReasonSchema.safeParse(remarks);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the remarks" };
  const parsedUnits = deliveryReturnUnitsSchema.safeParse(units);
  if (!parsedUnits.success || !parsedUnits.data) {
    return { error: parsedUnits.error?.issues[0]?.message ?? "Tick the units to reject" };
  }
  try {
    const row = await scDeliveryReturnService.request(returnActor(session), {
      deliveryId,
      reason: parsed.data,
      units: parsedUnits.data,
    });
    revalidateScDelivery(deliveryId);
    return {
      success: true as const,
      id: row.id,
      requestNo: row.requestNo,
      status: row.status,
      sapDocNo: row.sapDocNo,
      sapError: row.sapError,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to reject the units" };
  }
}

export async function getScDeliveryReturnAction(
  returnId: string,
): Promise<{ success: true; detail: DeliveryReturnDetail } | { error: string }> {
  const session = await requireAnyPermission(SC_LOGISTICS_PAGE_PERMISSIONS);
  try {
    return { success: true as const, detail: await scDeliveryReturnService.get(returnActor(session), returnId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load the reject request" };
  }
}

export async function retryScDeliveryReturnSapAction(
  returnId: string,
): Promise<({ success: true } & DeliveryReturnOutcome) | { error: string }> {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACTION_CAPABILITIES.canRejectDelivery]);
  try {
    const outcome = await scDeliveryReturnService.retrySap(returnActor(session), returnId);
    revalidateScLogistics();
    return { success: true as const, ...outcome };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to retry the SAP posting" };
  }
}

export async function cancelScDeliveryReturnAction(
  returnId: string,
  note: unknown,
): Promise<({ success: true } & DeliveryReturnOutcome) | { error: string }> {
  const session = await requireAnyPermission([...SC_LOGISTICS_ACTION_CAPABILITIES.canRejectDelivery]);
  const parsed = deliveryReturnCancelNoteSchema.safeParse(note);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the reason" };
  try {
    const outcome = await scDeliveryReturnService.cancelApproved(returnActor(session), returnId, parsed.data);
    revalidateScLogistics();
    return { success: true as const, ...outcome };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to cancel the reject" };
  }
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
    include: { lines: { select: { serialNumberId: true, acceptedAt: true, returnedAt: true } } },
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
    const open = new Set(delivery.lines.filter(isScLineInTransit).map((line) => line.serialNumberId));
    if (serialNumberIds.some((id) => !open.has(id))) {
      return { error: "Only serials on this SAP delivery that are still in transit can be accepted" as const };
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
  let outcome: "accepted" | "partial" = "accepted";
  try {
    await prisma.$transaction(async (tx) => {
      await lockSerialNumbers(tx, serialNumberIds);
      if (fromSap) {
        // Same order as a reject: serials, then the delivery row. A rejected unit goes back to SAP.
        await lockScDeliveryRow(tx, tenantId, deliveryId);
        const onReject = await tx.serviceCenterDeliveryReturnLine.count({
          where: {
            serialNumberId: { in: serialNumberIds },
            returnRequest: { tenantId, deliveryId, status: { in: [...SC_OPEN_RETURN_STATUSES] } },
          },
        });
        if (onReject > 0) throw new Error(SC_RETURN_ALREADY_OPEN_ERROR);
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
      await tx.serviceBackload.createMany({
        data: serialNumberIds.map((serialNumberId) => ({
          tenantId,
          serviceCenterId: delivery.serviceCenterId,
          serviceCenterLocationId: locationId,
          deliveryId: delivery.id,
          serialNumberId,
        })),
      });
      await placeServiceCenterUnits(tx, {
        tenantId,
        serviceCenterId: delivery.serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberIds,
        statusCodeId: stkCodeId,
      });

      let statusCodeId = acceptedCodeId;
      if (fromSap) {
        await tx.serviceCenterDeliveryLine.updateMany({
          where: { deliveryId, serialNumberId: { in: serialNumberIds }, acceptedAt: null, returnedAt: null },
          data: { acceptedAt: new Date() },
        });
        const lines = await tx.serviceCenterDeliveryLine.findMany({
          where: { deliveryId },
          select: { acceptedAt: true, returnedAt: true },
        });
        outcome = scDeliverySettledStatus(lines) as "accepted" | "partial";
        statusCodeId = outcome === "accepted" ? acceptedCodeId : partialCodeId;
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
    }, SC_DR_TRANSACTION_OPTIONS);
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
    status: outcome as "accepted" | "partial",
  };
}
