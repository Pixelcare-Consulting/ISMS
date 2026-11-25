import { Prisma } from "@/lib/database/generated/prisma/client";
import {
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { resolveSerials } from "@/features/logistics/services/sap-copy-to-follow.service";
import {
  checkFollowedDocument,
  parseFollowedDocument,
  specialInstructionsBySerial,
  type FollowedDocument,
} from "@/features/logistics/services/sap-copy-to-follow.planner";
import {
  findDeliveryNotesBySalesOrder,
  findSalesOrderStates,
} from "@/features/orders/services/sap-sales-order-import.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { sapErrorMessage } from "@/features/sap/services/sap-master-data";
import { sapServiceLayerClient } from "@/features/sap/services/sap-service-layer-client";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { withSapSyncLock } from "@/features/sap/services/sap-sync-lock";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import {
  placeServiceCenterUnits,
  SC_DR_TRANSACTION_OPTIONS,
} from "@/features/service-center-ops/services/service-center-placement";
import {
  blockedPlacementMessage,
  SC_SAP_CHECK_BATCH,
  SC_SAP_CHECK_ORDERS_PER_RUN,
  scDeliveryLocationId,
  scDeliveryNoForDr,
  scPlacementsToReplace,
  type ScOrderSapCheckResult,
} from "@/features/service-center-ordering/lib/sc-order-sap-check";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Check SAP for service-center orders. ISMS posts an approved SC order as a SAP Sales Order;
 * a SAP user then copies it to a Delivery (DR) with Copy To. This finds those DRs by their
 * base SO, and makes each one an SC delivery: the DR's serials leave ISMS's warehouse row and
 * arrive DIT at the order's SC location, where Accept turns them STK.
 *
 * Manual only (a button), and light: one DR lookup and one SO status call per 20 orders,
 * then one read per DR that ISMS does not have yet.
 */

interface CheckedOrder {
  id: string;
  orderNumber: string;
  serviceCenterId: string;
  serviceCenterLocationId: string | null;
  sapDocEntry: number;
}

interface InventoryCodes {
  dit: string;
  pending: string;
}

/** The SO's ISMS order and where its DRs go, for one DR. */
interface DrTarget {
  order: CheckedOrder;
  locationId: string | null;
}

async function readDeliveryNote(creds: SapServiceLayerCredentials, docEntry: number): Promise<FollowedDocument> {
  // No $select: with one, the Service Layer leaves each line's SerialNumbers out.
  const response = await sapServiceLayerClient.request<Record<string, unknown>>({
    creds,
    method: "GET",
    path: `/DeliveryNotes(${docEntry})`,
  });
  if (response.statusCode >= 400) {
    throw new Error(sapErrorMessage(response.statusCode, response.rawBody, "DeliveryNotes"));
  }
  const parsed = parseFollowedDocument("DR", response.data ?? {});
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Approved SC orders with a posted SO that SAP has not finished delivering, in scope. */
function ordersToCheck(tenantId: string, serviceCenterIds: string[] | null): Promise<CheckedOrder[]> {
  return prisma.serviceCenterOrder
    .findMany({
      where: {
        tenantId,
        status: "approved",
        sapDocEntry: { not: null },
        sapClosedAt: null,
        ...(serviceCenterIds ? { serviceCenterId: { in: serviceCenterIds } } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        serviceCenterId: true,
        serviceCenterLocationId: true,
        sapDocEntry: true,
      },
      orderBy: { createdAt: "desc" },
      take: SC_SAP_CHECK_ORDERS_PER_RUN,
    })
    .then((rows) => rows.flatMap((row) => (row.sapDocEntry == null ? [] : [{ ...row, sapDocEntry: row.sapDocEntry }])));
}

async function locationIdsByCenter(tenantId: string, centerIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.serviceCenterLocation.findMany({
    where: { serviceCenterId: { in: centerIds }, serviceCenter: { tenantId } },
    select: { id: true, serviceCenterId: true },
  });
  const byCenter = new Map<string, string[]>();
  for (const row of rows) byCenter.set(row.serviceCenterId, [...(byCenter.get(row.serviceCenterId) ?? []), row.id]);
  return byCenter;
}

/**
 * Makes one DR an SC delivery in one transaction. Returns the number of serials on it.
 * The unique DocEntry on deliveries makes a repeated or concurrent run a no-op.
 */
async function applyDeliveryNote(
  tenantId: string,
  userId: string,
  target: DrTarget,
  doc: FollowedDocument,
  serialNos: string[],
  codes: InventoryCodes,
): Promise<number> {
  const { order, locationId } = target;
  return prisma.$transaction(async (tx) => {
    const idBySerial = await resolveSerials(tx, tenantId, doc, serialNos);
    const serialIds = [...new Set(idBySerial.values())];
    await lockSerialNumbers(tx, serialIds);

    // Already on another SC delivery, neither accepted nor rejected back: the DR would double count it.
    const onOpenDelivery = await tx.serviceCenterDeliveryLine.findMany({
      where: { serialNumberId: { in: serialIds }, acceptedAt: null, returnedAt: null },
      select: { serialNumber: { select: { serialNo: true } }, delivery: { select: { deliveryNo: true } } },
    });
    if (onOpenDelivery.length > 0) {
      throw new Error(
        onOpenDelivery
          .map((row) => `${row.serialNumber.serialNo} is already on delivery ${row.delivery.deliveryNo}`)
          .join("; "),
      );
    }

    // With a location, the serials arrive DIT there now. Without one they stay where ISMS
    // has them until Accept, which asks for the location.
    if (locationId) {
      const placements = (await loadCurrentPlacements(tx, serialIds)).filter((row) => row.tenantId === tenantId);
      const { warehouseRowIds, blocked } = scPlacementsToReplace(placements, locationId);
      if (blocked.length > 0) throw new Error(blockedPlacementMessage(blocked));
      if (warehouseRowIds.length > 0) {
        await tx.warehouseInventory.deleteMany({ where: { id: { in: warehouseRowIds } } });
      }
      await placeServiceCenterUnits(tx, {
        tenantId,
        serviceCenterId: order.serviceCenterId,
        serviceCenterLocationId: locationId,
        serialNumberIds: serialIds,
        statusCodeId: codes.dit,
      });
    }

    const deliveryNo = scDeliveryNoForDr(doc.docEntry);
    const instructionsBySerial = specialInstructionsBySerial(doc);
    const lineData = [...idBySerial].map(([serialNo, serialNumberId]) => ({
      serialNumberId,
      sapSpecialInstructions: instructionsBySerial.get(serialNo) ?? null,
    }));
    const delivery = await tx.serviceCenterDelivery.create({
      data: {
        tenantId,
        serviceCenterId: order.serviceCenterId,
        serviceCenterLocationId: locationId,
        orderId: order.id,
        deliveryNo,
        statusCodeId: codes.pending,
        sapDocEntry: doc.docEntry,
        sapDocNum: doc.docNum,
        sapDocNo: doc.displayNo,
        sapDocDate: doc.docDate ? new Date(doc.docDate) : null,
        lines: { createMany: { data: lineData } },
      },
      select: { id: true },
    });

    await tx.serialNumberHistory.createMany({
      data: serialIds.map((serialNumberId) => ({
        tenantId,
        serialNumberId,
        txnType: "delivery" as const,
        details: `Delivered in SAP on DR ${doc.displayNo} for service center order ${order.orderNumber}`,
        status: "DIT",
      })),
    });
    // The DR took the serial out of SAP stock.
    await tx.serialNumber.updateMany({
      where: { id: { in: serialIds } },
      data: { sapWhsCode: null, sapOnHand: false, sapOnHandSyncedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "sc_delivery.created_from_sap",
        entityType: "ServiceCenterDelivery",
        entityId: delivery.id,
        metadata: {
          deliveryNo,
          orderNumber: order.orderNumber,
          drDocEntry: doc.docEntry,
          drNo: doc.displayNo,
          serialCount: serialIds.length,
          placedDit: Boolean(locationId),
        },
      },
    });
    return serialIds.length;
  }, SC_DR_TRANSACTION_OPTIONS);
}

/** One batch of orders: find their DRs, apply the new ones, close orders SAP finished. */
async function checkBatch(
  tenantId: string,
  userId: string,
  creds: SapServiceLayerCredentials,
  orders: CheckedOrder[],
  locationsByCenter: Map<string, string[]>,
  codes: InventoryCodes,
  result: ScOrderSapCheckResult,
): Promise<void> {
  const soEntries = orders.map((order) => order.sapDocEntry);
  const [drsBySo, soStates] = await Promise.all([
    findDeliveryNotesBySalesOrder(creds, soEntries),
    findSalesOrderStates(creds, soEntries),
  ]);
  const allDrEntries = [...drsBySo.values()].flat();
  const known = new Set(
    (
      await prisma.serviceCenterDelivery.findMany({
        where: { tenantId, sapDocEntry: { in: allDrEntries } },
        select: { sapDocEntry: true },
      })
    ).map((row) => row.sapDocEntry),
  );

  for (const order of orders) {
    let complete = true;
    const target: DrTarget = {
      order,
      locationId: scDeliveryLocationId(order.serviceCenterLocationId, locationsByCenter.get(order.serviceCenterId) ?? []),
    };
    for (const drEntry of drsBySo.get(order.sapDocEntry) ?? []) {
      if (known.has(drEntry)) continue;
      try {
        const doc = await readDeliveryNote(creds, drEntry);
        // A DR cancelled before ISMS saw it delivered nothing; SAP reopens the SO lines.
        if (doc.cancelled) continue;
        const check = checkFollowedDocument(doc, { sapDocType: "SO", sapDocEntry: order.sapDocEntry });
        if (!check.ok) throw new Error(check.reason);
        result.serialCount += await applyDeliveryNote(tenantId, userId, target, doc, check.serialNos, codes);
        result.deliveriesCreated += 1;
        known.add(drEntry);
      } catch (error) {
        if (isUniqueViolation(error)) continue; // Another run added this DR first.
        complete = false;
        const reason = error instanceof Error ? error.message : String(error);
        result.problems.push(`${order.orderNumber}: ${reason}.`);
        logger.warn({ tenantId, orderNumber: order.orderNumber, drEntry, reason }, "sc-order-sap-check: DR not applied");
      }
    }
    // SAP closed the SO (fully delivered, closed by hand, or cancelled) and every DR is in:
    // nothing more can come, so later runs skip the order.
    if (complete && soStates.get(order.sapDocEntry)?.closed) {
      await prisma.serviceCenterOrder.updateMany({
        where: { id: order.id, tenantId, sapClosedAt: null },
        data: { sapClosedAt: new Date() },
      });
    }
  }
}

/** Runs Check SAP for the approved SC orders `serviceCenterIds` allows (null = all). */
export function checkScOrdersInSap(
  tenantId: string,
  userId: string,
  serviceCenterIds: string[] | null,
): Promise<ScOrderSapCheckResult> {
  // A second click joins the run in progress. Keyed per user, since the result lists only
  // orders in that user's scope; two users at once are safe (one delivery per DR).
  return withSapSyncLock(`sc-order-sap-check:${tenantId}:${userId}`, async () => {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) throw new Error("SAP Service Layer is not configured");

    const result: ScOrderSapCheckResult = { ordersChecked: 0, deliveriesCreated: 0, serialCount: 0, problems: [] };
    const orders = await ordersToCheck(tenantId, serviceCenterIds);
    result.ordersChecked = orders.length;
    if (orders.length === 0) return result;

    const [dit, pending, locationsByCenter] = await Promise.all([
      reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
      reasonStatusService.requireCodeId(tenantId, "delivery_workflow", "pending"),
      locationIdsByCenter(tenantId, [...new Set(orders.map((order) => order.serviceCenterId))]),
    ]);
    for (let start = 0; start < orders.length; start += SC_SAP_CHECK_BATCH) {
      await checkBatch(
        tenantId,
        userId,
        creds,
        orders.slice(start, start + SC_SAP_CHECK_BATCH),
        locationsByCenter,
        { dit, pending },
        result,
      );
    }
    return result;
  });
}
