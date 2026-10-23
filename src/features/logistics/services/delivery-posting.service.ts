import type { DeliveryReturnStatus, SapOrderDocType } from "@prisma/client";
import { Prisma } from "@/lib/database/generated/prisma/client";

import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import { prisma } from "@/lib/database/client";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import {
  assertExclusiveClaim,
  planAccept,
  planDispatch,
  planDeliverySettle,
  planDispatchBranchPlacement,
  planReject,
  receiptLineState,
  RETURN_WAITING_ERROR,
  selectDispatchCandidates,
  type BranchUnitStatus,
  type DeliveryPostingView,
  type DeliveryReceiptLineState,
  type WarehouseHold,
} from "@/features/logistics/services/delivery-posting.planner";
import { resolveSapOutboundPort } from "@/features/sap/adapters/resolve-sap-outbound";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import {
  assertNotOnOpenTransfer,
  findOpenTransferLines,
} from "@/features/logistics/services/delivery-transfer-open-lines";
import {
  hasOpenReturn,
  lockDeliveryRow,
  txWorkflowCodeId,
} from "@/features/logistics/services/delivery-settle";
import type { PostingActor, PostingDb } from "@/features/logistics/services/posting-support";

/**
 * ISMS warehouse and branch movements for a delivery.
 *
 * Process II ends when Supply Planning approves: the approved_order job posts
 * the live SAP ITR (OWTQ, consignment) or SO (ORDR, outright) and opens the
 * local BranchDelivery (Process III.A entry). Dispatch posts the SAP IT or DR
 * copied from that document first, then moves warehouse → DIT; accept moves
 * DIT → STK per unit, and units not accepted go on a unit transfer.
 * Reject only closes an undispatched delivery; in-transit units go back through
 * a return request (delivery-return.service), which posts SAP first.
 */

async function workflowCodeId(
  tenantId: string,
  code: "approved" | "pending" | "accepted" | "rejected" | "partial",
) {
  return reasonStatusService.requireCodeId(tenantId, "delivery_workflow", code);
}

async function inventoryCodeId(tenantId: string, code: "DIT" | "STK") {
  return reasonStatusService.requireCodeId(tenantId, "inventory_system", code);
}

function claimError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("One or more serials are missing, already allocated, or not in that warehouse");
  }
  return error instanceof Error ? error : new Error("Delivery posting failed");
}

function asBranchStatus(code: string | null | undefined): BranchUnitStatus | null {
  if (code === "DIT" || code === "STK" || code === "SLD" || code === "DEF") return code;
  if (!code) return null;
  return "OTHER";
}

export type LoadedDelivery = DeliveryPostingView & {
  sapDocEntry: number | null;
  drNo: string | null;
  /** SAP document type stored on the order at approval; null on orders approved before SAP posting. */
  orderSapDocType: SapOrderDocType | null;
};

export async function loadDelivery(tenantId: string, deliveryId: string): Promise<LoadedDelivery | null> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    include: {
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true, warehouseLocationFromId: true } },
      order: {
        select: {
          sapDocType: true,
          details: { select: { modelId: true, quantity: true, approvedQty: true } },
        },
      },
    },
  });
  if (!delivery) return null;

  const lineSerialIds = delivery.lines.map((line) => line.serialNumberId);
  const branchUnits = lineSerialIds.length
    ? await prisma.branchInventory.findMany({
        where: {
          tenantId,
          branchId: delivery.branchId,
          serialNumberId: { in: lineSerialIds },
        },
        select: { serialNumberId: true, statusCode: { select: { code: true } } },
      })
    : [];
  const statusBySerial = new Map(branchUnits.map((row) => [row.serialNumberId, row.statusCode.code]));

  const requirements = (delivery.order?.details ?? [])
    .map((detail) => ({
      modelId: detail.modelId,
      quantity: detail.approvedQty ?? detail.quantity,
    }))
    .filter((detail) => detail.quantity > 0);

  const status = delivery.statusCode.code;
  const known: DeliveryPostingView["status"] =
    status === "approved" ||
    status === "pending" ||
    status === "accepted" ||
    status === "rejected" ||
    status === "partial" ||
    status === "requested"
      ? status
      : "requested";

  return {
    id: delivery.id,
    branchId: delivery.branchId,
    sourceWarehouseId: delivery.sourceWarehouseId,
    sapDocEntry: delivery.sapDocEntry,
    drNo: delivery.drNo,
    orderSapDocType: delivery.order?.sapDocType ?? null,
    status: known,
    lines: delivery.lines.map((line) => ({
      serialNumberId: line.serialNumberId,
      warehouseLocationFromId: line.warehouseLocationFromId,
      branchStatus: asBranchStatus(statusBySerial.get(line.serialNumberId)),
    })),
    requirements,
  };
}

const SAP_DISPATCH_POSTED_ACTION = "delivery.sap_dispatch_posted";

/** A retry must dispatch the serials already on the SAP document. No audit row means posted before this guard. */
async function assertSameSerialsAsSapPost(
  tenantId: string,
  deliveryId: string,
  drNo: string | null,
  requestedIds: string[],
) {
  const posted = await prisma.auditLog.findFirst({
    where: { tenantId, entityType: "BranchDelivery", entityId: deliveryId, action: SAP_DISPATCH_POSTED_ACTION },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const metadata = posted?.metadata as { serialNumberIds?: unknown } | null | undefined;
  const postedIds = Array.isArray(metadata?.serialNumberIds)
    ? (metadata.serialNumberIds as string[]).slice().sort()
    : null;
  if (!postedIds) return;
  if (postedIds.length === requestedIds.length && postedIds.every((id, i) => id === requestedIds[i])) return;

  const rows = await prisma.serialNumber.findMany({
    where: { tenantId, id: { in: postedIds } },
    select: { serialNo: true },
    orderBy: { serialNo: "asc" },
  });
  throw new Error(
    `SAP already has DR# ${drNo ?? ""} for this delivery with different serials. Dispatch the same serials: ${rows.map((r) => r.serialNo).join(", ")}.`,
  );
}

interface SapHeldSerial {
  id: string;
  serialNo: string;
  modelId: string;
  warehouseId: string;
  warehouseCode: string;
  /** Branch whose unlocated STK unit this is (the sync's stock-in); null when unplaced. */
  heldBy: string | null;
  source: "SAP" | "SAP_BRANCH";
}

/**
 * Serials the SAP sync linked to an ISMS warehouse (`sap_whs_code`) that ISMS has not
 * shelved there. Either ISMS holds them nowhere, or the sync's stock-in made them branch
 * STK with no location. Anything else (shelved, in transit, sold, defective, at a
 * service centre) is not SAP-held warehouse stock and is left out.
 */
async function findSapHeldSerials(
  tenantId: string,
  filter: { serialNumberIds?: string[]; modelIds?: string[]; warehouseIds?: string[] },
): Promise<SapHeldSerial[]> {
  const warehouses = await prisma.warehouse.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(filter.warehouseIds ? { id: { in: filter.warehouseIds } } : {}),
    },
    select: { id: true, code: true },
  });
  if (warehouses.length === 0) return [];
  const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code, warehouse]));

  const rows = await prisma.serialNumber.findMany({
    where: {
      tenantId,
      deletedAt: null,
      sapWhsCode: { in: [...warehouseByCode.keys()] },
      ...(filter.serialNumberIds ? { id: { in: filter.serialNumberIds } } : {}),
      ...(filter.modelIds ? { modelId: { in: filter.modelIds } } : {}),
      warehouseInventories: { none: {} },
      serviceCenterInventories: { none: {} },
      // Vacuously true with no branch row: at most one exists (unique per serial).
      branchInventories: { every: { warehouseLocationId: null, statusCode: { code: "STK" } } },
    },
    select: {
      id: true,
      serialNo: true,
      modelId: true,
      sapWhsCode: true,
      branchInventories: { select: { branch: { select: { name: true } } } },
    },
  });

  return rows.flatMap((row) => {
    const warehouse = row.sapWhsCode ? warehouseByCode.get(row.sapWhsCode) : undefined;
    if (!warehouse) return [];
    const branchRow = row.branchInventories[0];
    return [
      {
        id: row.id,
        serialNo: row.serialNo,
        modelId: row.modelId,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        heldBy: branchRow?.branch.name ?? null,
        source: branchRow ? ("SAP_BRANCH" as const) : ("SAP" as const),
      },
    ];
  });
}

async function loadHolds(tenantId: string, serialNumberIds: string[]): Promise<WarehouseHold[]> {
  if (serialNumberIds.length === 0) return [];
  const [rows, tagged, sapHeld] = await Promise.all([
    prisma.warehouseInventory.findMany({
      where: { tenantId, serialNumberId: { in: serialNumberIds } },
      select: {
        serialNumberId: true,
        warehouseLocationId: true,
        warehouseLocation: { select: { warehouseId: true } },
        serialNumber: { select: { modelId: true } },
      },
    }),
    prisma.branchInventory.findMany({
      where: { ...taggedStockWhere(tenantId), serialNumberId: { in: serialNumberIds } },
      select: {
        serialNumberId: true,
        warehouseLocationId: true,
        warehouseLocation: { select: { warehouseId: true } },
        serialNumber: { select: { modelId: true } },
      },
    }),
    findSapHeldSerials(tenantId, { serialNumberIds }),
  ]);
  return [
    ...rows.map((row) => ({
      serialNumberId: row.serialNumberId,
      modelId: row.serialNumber.modelId,
      warehouseId: row.warehouseLocation.warehouseId,
      warehouseLocationId: row.warehouseLocationId,
      source: "WAREHOUSE" as const,
    })),
    ...tagged.flatMap((row) =>
      row.warehouseLocation && row.warehouseLocationId
        ? [
            {
              serialNumberId: row.serialNumberId,
              modelId: row.serialNumber.modelId,
              warehouseId: row.warehouseLocation.warehouseId,
              warehouseLocationId: row.warehouseLocationId,
              source: "BRANCH" as const,
            },
          ]
        : [],
    ),
    ...sapHeld.map((row) => ({
      serialNumberId: row.id,
      modelId: row.modelId,
      warehouseId: row.warehouseId,
      warehouseLocationId: null,
      source: row.source,
    })),
  ];
}

/**
 * Branch stock stocked into a warehouse location and still sellable stock:
 * dispatch may take it from that location like warehouse stock.
 */
function taggedStockWhere(tenantId: string) {
  return {
    tenantId,
    warehouseLocationId: { not: null },
    statusCode: { code: "STK" },
  };
}

export interface DispatchCandidate {
  id: string;
  serialNo: string;
  modelId: string;
  warehouseCode: string;
  /** Empty for serials only SAP places in the warehouse: ISMS has no shelf for them. */
  locationCode: string;
  /** Branch holding a stocked-in branch unit; null for warehouse stock. */
  heldBy: string | null;
  /** ISMS: shelved by Stock in or warehouse receiving. SAP: linked by the serial sync. */
  source: "ISMS" | "SAP";
}

/** One ordered model on a delivery and how many serials dispatch must pick for it. */
export interface DispatchModelRequirement {
  modelId: string;
  skuCode: string;
  modelName: string;
  requiredQty: number;
}

export interface DeliveryReceiptLine {
  serialNumberId: string;
  serialNo: string;
  skuCode: string;
  modelName: string;
  /** Still DIT at the delivery branch, so it can be accepted or returned. */
  inTransit: boolean;
  /** Held by a pending or approved unit transfer: not acceptable here. */
  openTransfer: { id: string; transferNo: string } | null;
  /** Group in the receive dialog; TRANSFERRED units left on one of this delivery's unit transfers. */
  state: DeliveryReceiptLineState;
}

/**
 * Re-derives the delivery status after units left it by another route (unit
 * transfer receive, return). Runs inside the caller's transaction. Returns the
 * new status, or null when it did not change.
 */
export async function finalizeDeliveryIfSettled(
  tx: PostingDb,
  tenantId: string,
  deliveryId: string,
): Promise<"accepted" | "partial" | null> {
  // Serialises concurrent settles (two transfer receives, or a receive and an accept).
  await lockDeliveryRow(tx, tenantId, deliveryId);
  const delivery = await tx.branchDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    select: {
      branchId: true,
      acceptedAt: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      lines: { select: { serialNumberId: true } },
    },
  });
  if (!delivery) return null;
  const current = delivery.statusCode.code;
  if (current !== "pending" && current !== "partial") return null;

  const stillInTransit = delivery.lines.length
    ? await tx.branchInventory.count({
        where: {
          tenantId,
          branchId: delivery.branchId,
          serialNumberId: { in: delivery.lines.map((line) => line.serialNumberId) },
          statusCode: { code: "DIT" },
        },
      })
    : 0;
  const next = planDeliverySettle({ totalLines: delivery.lines.length, stillInTransit });
  if (!next || next === current) return null;

  const nextCodeId = await txWorkflowCodeId(tx, tenantId, next);
  const claimed = await tx.branchDelivery.updateMany({
    where: { id: deliveryId, tenantId, statusCodeId: delivery.statusCodeId },
    data: {
      statusCodeId: nextCodeId,
      ...(next === "accepted" && !delivery.acceptedAt ? { acceptedAt: new Date() } : {}),
    },
  });
  assertExclusiveClaim(claimed.count, 1, "This delivery was updated by someone else");
  return next;
}

export interface DeliveryDetail {
  id: string;
  deliveryNo: string;
  drNo: string | null;
  drDate: string | null;
  status: { code: string; name: string; color: string | null };
  branch: { name: string };
  order: { orderNumber: string } | null;
  /** Approved order lines. Shown when the delivery has no serials yet. */
  orderLines: { id: string; skuCode: string; modelName: string; quantity: number }[];
  serials: { serialNumberId: string; serialNo: string; skuCode: string; modelName: string }[];
  latestReturn: {
    id: string;
    requestNo: string;
    status: DeliveryReturnStatus;
    sapError: string | null;
  } | null;
  history: { id: string; action: string; at: string; userName: string | null }[];
}

export const deliveryPostingService = {
  /** Header, approved lines or serials, and audit history for the delivery page. */
  async getDetail(actor: PostingActor, deliveryId: string): Promise<DeliveryDetail> {
    const delivery = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: {
        id: true,
        deliveryNo: true,
        drNo: true,
        drDate: true,
        branchId: true,
        sourceWarehouseId: true,
        branch: { select: { name: true } },
        statusCode: { select: { code: true, name: true, color: true } },
        order: {
          select: {
            orderNumber: true,
            details: {
              select: {
                id: true,
                quantity: true,
                approvedQty: true,
                model: { select: { skuCode: true, name: true } },
              },
              orderBy: { model: { skuCode: "asc" } },
            },
          },
        },
        lines: {
          select: {
            serialNumberId: true,
            serialNumber: {
              select: {
                serialNo: true,
                model: { select: { skuCode: true, name: true } },
              },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
        returnRequests: {
          orderBy: { requestedAt: "desc" },
          take: 1,
          select: { id: true, requestNo: true, status: true, sapError: true },
        },
      },
    });
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, {
      branchId: delivery.branchId,
      sourceWarehouseId: delivery.sourceWarehouseId,
    });

    const history = await prisma.auditLog.findMany({
      where: { tenantId: actor.tenantId, entityType: "BranchDelivery", entityId: delivery.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, createdAt: true, user: { select: { name: true } } },
    });

    const orderLines = (delivery.order?.details ?? []).flatMap((detail) => {
      const quantity = detail.approvedQty ?? detail.quantity;
      if (quantity <= 0) return [];
      return [
        {
          id: detail.id,
          skuCode: detail.model.skuCode,
          modelName: detail.model.name,
          quantity,
        },
      ];
    });

    return {
      id: delivery.id,
      deliveryNo: delivery.deliveryNo,
      drNo: delivery.drNo,
      drDate: delivery.drDate ? delivery.drDate.toISOString() : null,
      status: delivery.statusCode,
      branch: { name: delivery.branch.name },
      order: delivery.order ? { orderNumber: delivery.order.orderNumber } : null,
      orderLines,
      serials: delivery.lines.map((line) => ({
        serialNumberId: line.serialNumberId,
        serialNo: line.serialNumber.serialNo,
        skuCode: line.serialNumber.model.skuCode,
        modelName: line.serialNumber.model.name,
      })),
      latestReturn: delivery.returnRequests[0] ?? null,
      history: history.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        userName: row.user?.name || null,
      })),
    };
  },

  /** Serials on a dispatched delivery, split by whether the branch has received them. */
  async listReceiptLines(
    actor: PostingActor,
    deliveryId: string,
  ): Promise<{ deliveryNo: string; status: DeliveryPostingView["status"]; lines: DeliveryReceiptLine[] }> {
    const preview = await loadDelivery(actor.tenantId, deliveryId);
    if (!preview) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, preview);

    const header = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: {
        deliveryNo: true,
        lines: {
          select: {
            serialNumberId: true,
            serialNumber: {
              select: { serialNo: true, model: { select: { skuCode: true, name: true } } },
            },
          },
          orderBy: { serialNumber: { serialNo: "asc" } },
        },
      },
    });
    if (!header) throw new Error("Delivery not found");

    const statusBySerial = new Map(preview.lines.map((line) => [line.serialNumberId, line.branchStatus]));
    const serialIds = header.lines.map((line) => line.serialNumberId);
    const [openTransfers, receivedOnTransfer] = await Promise.all([
      findOpenTransferLines(prisma, actor.tenantId, serialIds),
      serialIds.length
        ? prisma.deliveryTransferLine.findMany({
            where: {
              serialNumberId: { in: serialIds },
              status: "RECEIVED",
              transfer: { tenantId: actor.tenantId, deliveryId },
            },
            select: { serialNumberId: true },
          })
        : Promise.resolve([]),
    ]);
    const transferredIds = new Set(receivedOnTransfer.map((row) => row.serialNumberId));
    const transferBySerial = new Map(
      openTransfers.map((row) => [row.serialNumberId, { id: row.transferId, transferNo: row.transferNo }]),
    );
    return {
      deliveryNo: header.deliveryNo,
      status: preview.status,
      lines: header.lines.map((line) => {
        const branchStatus = statusBySerial.get(line.serialNumberId) ?? null;
        const openTransfer = transferBySerial.get(line.serialNumberId) ?? null;
        return {
          serialNumberId: line.serialNumberId,
          serialNo: line.serialNumber.serialNo,
          skuCode: line.serialNumber.model.skuCode,
          modelName: line.serialNumber.model.name,
          inTransit: branchStatus === "DIT",
          openTransfer,
          state: receiptLineState({
            branchStatus,
            onOpenTransfer: openTransfer !== null,
            receivedOnTransfer: transferredIds.has(line.serialNumberId),
          }),
        };
      }),
    };
  },

  async listDispatchCandidates(tenantId: string, deliveryId: string): Promise<{
    requiredQty: number;
    models: DispatchModelRequirement[];
    serials: DispatchCandidate[];
  }> {
    const delivery = await loadDelivery(tenantId, deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    if (delivery.status !== "approved") {
      throw new Error("Only an approved delivery can be dispatched");
    }
    const modelIds = delivery.requirements.map((row) => row.modelId);
    const requiredQty = delivery.requirements.reduce((sum, row) => sum + row.quantity, 0);
    if (modelIds.length === 0) {
      return { requiredQty: 0, models: [], serials: [] };
    }

    // An order can carry the same model on more than one line; dispatch picks per model.
    const requiredByModel = new Map<string, number>();
    for (const row of delivery.requirements) {
      requiredByModel.set(row.modelId, (requiredByModel.get(row.modelId) ?? 0) + row.quantity);
    }
    const modelRows = await prisma.productModel.findMany({
      where: { tenantId, id: { in: [...requiredByModel.keys()] } },
      select: { id: true, skuCode: true, name: true },
      orderBy: { skuCode: "asc" },
    });
    const models: DispatchModelRequirement[] = modelRows.map((model) => ({
      modelId: model.id,
      skuCode: model.skuCode,
      modelName: model.name,
      requiredQty: requiredByModel.get(model.id) ?? 0,
    }));

    const branch = await prisma.branch.findFirst({
      where: { id: delivery.branchId, tenantId },
      select: { primaryWarehouseId: true },
    });

    const primaryWarehouseId = branch?.primaryWarehouseId ?? null;
    const locationSelect = {
      select: { code: true, warehouse: { select: { id: true, code: true } } },
    } as const;
    const [rows, tagged, sapHeld] = await Promise.all([
      prisma.warehouseInventory.findMany({
        where: {
          tenantId,
          serialNumber: { modelId: { in: modelIds }, deletedAt: null },
          ...(primaryWarehouseId
            ? { warehouseLocation: { warehouseId: primaryWarehouseId } }
            : {}),
        },
        select: {
          serialNumberId: true,
          serialNumber: { select: { serialNo: true, modelId: true } },
          warehouseLocation: locationSelect,
        },
      }),
      prisma.branchInventory.findMany({
        where: {
          ...taggedStockWhere(tenantId),
          serialNumber: { modelId: { in: modelIds }, deletedAt: null },
          ...(primaryWarehouseId
            ? { warehouseLocation: { warehouseId: primaryWarehouseId } }
            : {}),
        },
        select: {
          serialNumberId: true,
          branch: { select: { name: true } },
          serialNumber: { select: { serialNo: true, modelId: true } },
          warehouseLocation: locationSelect,
        },
      }),
      findSapHeldSerials(tenantId, {
        modelIds,
        ...(primaryWarehouseId ? { warehouseIds: [primaryWarehouseId] } : {}),
      }),
    ]);

    const shelved = [
      ...rows.map((row) => ({ ...row, heldBy: null as string | null })),
      ...tagged.flatMap((row) =>
        row.warehouseLocation
          ? [{ ...row, warehouseLocation: row.warehouseLocation, heldBy: row.branch.name }]
          : [],
      ),
    ].map((row) => ({
      id: row.serialNumberId,
      serialNo: row.serialNumber.serialNo,
      modelId: row.serialNumber.modelId,
      deleted: false,
      warehouseId: row.warehouseLocation.warehouse.id,
      warehouseCode: row.warehouseLocation.warehouse.code,
      locationCode: row.warehouseLocation.code,
      heldBy: row.heldBy,
      source: "ISMS" as const,
    }));
    const sapOnly = sapHeld.map((row) => ({
      id: row.id,
      serialNo: row.serialNo,
      modelId: row.modelId,
      deleted: false,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouseCode,
      locationCode: "",
      heldBy: row.heldBy,
      source: "SAP" as const,
    }));

    const serials = selectDispatchCandidates(
      [...shelved, ...sapOnly].sort((a, b) => a.serialNo.localeCompare(b.serialNo)),
      modelIds,
      primaryWarehouseId,
    );

    return {
      requiredQty,
      models,
      serials: serials.map((row) => ({
        id: row.id,
        serialNo: row.serialNo,
        modelId: row.modelId,
        warehouseCode: row.warehouseCode,
        locationCode: row.locationCode,
        heldBy: row.heldBy,
        source: row.source,
      })),
    };
  },

  async dispatch(input: {
    tenantId: string;
    userId: string;
    permissions?: string[];
    deliveryId: string;
    serialNumberIds: string[];
  }): Promise<{ movedCount: number; drNo: string | null }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    const holds = await loadHolds(input.tenantId, input.serialNumberIds);
    const plan = planDispatch(preview, holds, input.serialNumberIds);
    if (!plan.ok) throw new Error(plan.error);

    const branch = await prisma.branch.findFirst({
      where: { id: preview.branchId, tenantId: input.tenantId },
      select: { primaryWarehouseId: true, name: true },
    });
    if (branch?.primaryWarehouseId && plan.warehouseId !== branch.primaryWarehouseId) {
      throw new Error("One or more serials are missing, already allocated, or not in that warehouse");
    }

    await authorizeDeliveryScope(input, preview);

    // SAP first: stock only moves once SAP has the IT or DR. The reference is saved
    // straight away so a retry after a failed local move does not post a second one.
    let drNo = preview.drNo;
    const requestedIds = [...plan.moves.map((move) => move.serialNumberId)].sort();
    if (preview.sapDocEntry == null) {
      const ref = await resolveSapOutboundPort().createDispatchDocument({
        tenantId: input.tenantId,
        deliveryId: input.deliveryId,
        serialNumberIds: requestedIds,
      });
      await prisma.$transaction(async (tx) => {
        await tx.branchDelivery.update({
          where: { id: input.deliveryId },
          // SAP can omit DocDate: an empty string would store an Invalid Date.
          data: { sapDocEntry: ref.docEntry, drNo: ref.displayNo, drDate: ref.docDate ? new Date(ref.docDate) : null },
        });
        // Remembers which serials SAP transferred, so a retry cannot move different ones.
        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            action: SAP_DISPATCH_POSTED_ACTION,
            entityType: "BranchDelivery",
            entityId: input.deliveryId,
            metadata: { sapDocEntry: ref.docEntry, drNo: ref.displayNo, serialNumberIds: requestedIds },
          },
        });
      });
      drNo = ref.displayNo;
    } else {
      await assertSameSerialsAsSapPost(input.tenantId, input.deliveryId, drNo, requestedIds);
    }

    const [pendingCodeId, ditCodeId, stkCodeId] = await Promise.all([
      workflowCodeId(input.tenantId, "pending"),
      inventoryCodeId(input.tenantId, "DIT"),
      inventoryCodeId(input.tenantId, "STK"),
    ]);
    // Branch units (shelved, or SAP-stocked without a shelf) are relocated. Warehouse rows
    // are removed. Serials only SAP places get a new branch unit, like warehouse rows do.
    const sourceById = new Map(holds.map((hold) => [hold.serialNumberId, hold.source]));
    const idsFrom = (source: WarehouseHold["source"]) =>
      plan.moves
        .map((move) => move.serialNumberId)
        .filter((serialNumberId) => sourceById.get(serialNumberId) === source);
    const relocateIds = idsFrom("BRANCH");
    const sapRelocateIds = idsFrom("SAP_BRANCH");
    const warehouseRowIds = new Set(idsFrom("WAREHOUSE"));
    const relocating = new Set([...relocateIds, ...sapRelocateIds]);
    const warehouseMoveIds = plan.moves
      .map((move) => move.serialNumberId)
      .filter((serialNumberId) => !relocating.has(serialNumberId));
    const approvedCodeId = await workflowCodeId(input.tenantId, "approved");

    try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.branchDelivery.updateMany({
        where: { id: input.deliveryId, tenantId: input.tenantId, statusCodeId: approvedCodeId },
        data: { statusCodeId: pendingCodeId },
      });
      assertExclusiveClaim(
        claimed.count,
        1,
        "This delivery has already been dispatched",
      );

      const moveIds = plan.moves.map((move) => move.serialNumberId);
      await lockSerialNumbers(tx, moveIds);
      const [serialRows, shelfRows] = await Promise.all([
        tx.serialNumber.findMany({
          where: { tenantId: input.tenantId, id: { in: moveIds } },
          select: { id: true, serialNo: true },
        }),
        tx.branchInventory.findMany({
          where: { tenantId: input.tenantId, serialNumberId: { in: warehouseMoveIds } },
          select: {
            serialNumberId: true,
            branchId: true,
            branch: { select: { name: true } },
            statusCode: { select: { code: true } },
          },
        }),
      ]);
      const serialNoById = new Map(serialRows.map((row) => [row.id, row.serialNo]));
      const placement = planDispatchBranchPlacement(
        preview.branchId,
        warehouseMoveIds.map((serialNumberId) => ({
          serialNumberId,
          serialNo: serialNoById.get(serialNumberId) ?? serialNumberId,
        })),
        shelfRows.map((row) => ({
          serialNumberId: row.serialNumberId,
          branchId: row.branchId,
          branchName: row.branch.name,
          status: asBranchStatus(row.statusCode.code) ?? "OTHER",
        })),
      );
      if (!placement.ok) {
        throw new Error(placement.error);
      }

      const occupied = await loadCurrentPlacements(tx, moveIds);
      const replacingIds = occupied
        .filter((row) => {
          if (
            row.table === "warehouse" &&
            row.warehouseId === plan.warehouseId &&
            warehouseRowIds.has(row.serialNumberId)
          ) {
            return true;
          }
          if (row.table === "branch" && relocating.has(row.serialNumberId)) return true;
          return (
            row.table === "branch" &&
            row.branchId === preview.branchId &&
            placement.updates.includes(row.serialNumberId)
          );
        })
        .map((row) => row.id);
      assertExclusivePlacement({ placements: occupied, replacingIds });

      if (warehouseRowIds.size > 0) {
        const removed = await tx.warehouseInventory.deleteMany({
          where: {
            tenantId: input.tenantId,
            serialNumberId: { in: [...warehouseRowIds] },
            warehouseLocation: { warehouseId: plan.warehouseId },
          },
        });
        assertExclusiveClaim(
          removed.count,
          warehouseRowIds.size,
          "One or more serials are missing, already allocated, or not in that warehouse",
        );
      }

      if (relocateIds.length > 0) {
        // Still stock and still on a shelf of this warehouse, re-read under the lock.
        const relocated = await tx.branchInventory.updateMany({
          where: {
            tenantId: input.tenantId,
            serialNumberId: { in: relocateIds },
            statusCodeId: stkCodeId,
            warehouseLocation: { warehouseId: plan.warehouseId },
          },
          data: {
            branchId: preview.branchId,
            statusCodeId: ditCodeId,
            warehouseLocationId: null,
            updatedById: input.userId,
          },
        });
        assertExclusiveClaim(
          relocated.count,
          relocateIds.length,
          "One or more serials were sold, moved or taken off their location. Reload and pick again.",
        );
      }

      if (sapRelocateIds.length > 0) {
        // Still unshelved stock, re-read under the lock.
        const relocated = await tx.branchInventory.updateMany({
          where: {
            tenantId: input.tenantId,
            serialNumberId: { in: sapRelocateIds },
            statusCodeId: stkCodeId,
            warehouseLocationId: null,
          },
          data: {
            branchId: preview.branchId,
            statusCodeId: ditCodeId,
            updatedById: input.userId,
          },
        });
        assertExclusiveClaim(
          relocated.count,
          sapRelocateIds.length,
          "One or more serials were sold, moved or stocked in elsewhere. Reload and pick again.",
        );
      }

      if (placement.inserts.length > 0) {
        await tx.branchInventory.createMany({
          data: placement.inserts.map((serialNumberId) => ({
            tenantId: input.tenantId,
            branchId: preview.branchId,
            serialNumberId,
            statusCodeId: ditCodeId,
            updatedById: input.userId,
          })),
        });
      }

      if (placement.updates.length > 0) {
        const updated = await tx.branchInventory.updateMany({
          where: {
            tenantId: input.tenantId,
            branchId: preview.branchId,
            serialNumberId: { in: placement.updates },
          },
          data: { statusCodeId: ditCodeId, updatedById: input.userId },
        });
        assertExclusiveClaim(
          updated.count,
          placement.updates.length,
          "One or more serials are no longer on this branch",
        );
      }

      await tx.branchDeliveryLine.createMany({
        data: plan.moves.map((move) => ({
          deliveryId: input.deliveryId,
          serialNumberId: move.serialNumberId,
          warehouseLocationFromId: move.warehouseLocationId,
        })),
      });

      const header = await tx.branchDelivery.findFirst({
        where: { id: input.deliveryId, tenantId: input.tenantId },
        select: { deliveryNo: true },
      });

      await tx.serialNumberHistory.createMany({
        data: plan.moves.map((move) => ({
          tenantId: input.tenantId,
          serialNumberId: move.serialNumberId,
          txnType: "delivery" as const,
          details: `Dispatched on ${header?.deliveryNo ?? input.deliveryId} to ${branch?.name ?? "the branch"}`,
          status: "DIT",
          createdById: input.userId,
        })),
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "delivery.dispatched",
          entityType: "BranchDelivery",
          entityId: input.deliveryId,
          metadata: {
            movedCount: plan.moves.length,
            serialNumberIds: plan.moves.map((move) => move.serialNumberId),
          },
        },
      });
    });
    } catch (error) {
      throw claimError(error);
    }

    return { movedCount: plan.moves.length, drNo };
  },

  async accept(input: {
    tenantId: string;
    userId: string;
    permissions: string[] | undefined;
    deliveryId: string;
    serialNumberIds?: string[];
  }): Promise<{ movedCount: number; idempotent: boolean; status: "accepted" | "partial" }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    await authorizeDeliveryScope(input, preview);
    // Units on an open unit transfer are settled by that transfer, not here.
    const requestedIds =
      input.serialNumberIds ??
      preview.lines.filter((line) => line.branchStatus === "DIT").map((line) => line.serialNumberId);
    await assertNotOnOpenTransfer(prisma, input.tenantId, requestedIds);
    const plan = planAccept(preview, input.serialNumberIds ?? null, {
      openReturn: await hasOpenReturn(prisma, input.tenantId, input.deliveryId),
    });
    if (!plan.ok) throw new Error(plan.error);

    if (plan.idempotent && plan.moveSerialIds.length === 0 && preview.status === plan.nextStatus) {
      return { movedCount: plan.movedCount, idempotent: true, status: plan.nextStatus };
    }

    const [nextCodeId, ditCodeId, stkCodeId] = await Promise.all([
      workflowCodeId(input.tenantId, plan.nextStatus),
      inventoryCodeId(input.tenantId, "DIT"),
      inventoryCodeId(input.tenantId, "STK"),
    ]);
    const fromCodes = await Promise.all(
      (preview.status === "partial" ? (["partial"] as const) : (["pending", "partial"] as const)).map((code) =>
        workflowCodeId(input.tenantId, code),
      ),
    );

    let finalStatus: "accepted" | "partial" = plan.nextStatus;
    try {
    await prisma.$transaction(async (tx) => {
      // Lock order everywhere is serials, then the delivery row. The row lock is the
      // one a return request takes, so accept and a new request cannot interleave.
      if (plan.moveSerialIds.length > 0) await lockSerialNumbers(tx, plan.moveSerialIds);
      await lockDeliveryRow(tx, input.tenantId, input.deliveryId);
      if (await hasOpenReturn(tx, input.tenantId, input.deliveryId)) {
        throw new Error(RETURN_WAITING_ERROR);
      }
      if (plan.moveSerialIds.length > 0) {
        await assertNotOnOpenTransfer(tx, input.tenantId, plan.moveSerialIds);
        const moved = await tx.branchInventory.updateMany({
          where: {
            tenantId: input.tenantId,
            branchId: preview.branchId,
            statusCodeId: ditCodeId,
            serialNumberId: { in: plan.moveSerialIds },
          },
          data: { statusCodeId: stkCodeId, updatedById: input.userId },
        });
        assertExclusiveClaim(
          moved.count,
          plan.moveSerialIds.length,
          "Some serials are not in-transit at this branch",
        );
      }

      const claimed = await tx.branchDelivery.updateMany({
        where: {
          id: input.deliveryId,
          tenantId: input.tenantId,
          statusCodeId: { in: fromCodes },
        },
        data: {
          statusCodeId: nextCodeId,
          ...(plan.nextStatus === "accepted" ? { acceptedAt: new Date() } : {}),
        },
      });
      assertExclusiveClaim(claimed.count, 1, "Delivery could not be accepted");
      // Units that left on a unit transfer no longer hold the delivery open.
      finalStatus = (await finalizeDeliveryIfSettled(tx, input.tenantId, input.deliveryId)) ?? plan.nextStatus;

      if (plan.moveSerialIds.length > 0) {
        const header = await tx.branchDelivery.findFirst({
          where: { id: input.deliveryId, tenantId: input.tenantId },
          select: { deliveryNo: true, branch: { select: { name: true } } },
        });
        await tx.serialNumberHistory.createMany({
          data: plan.moveSerialIds.map((serialNumberId) => ({
            tenantId: input.tenantId,
            serialNumberId,
            txnType: "inv_acknowledgement" as const,
            details: `Accepted on ${header?.deliveryNo ?? input.deliveryId} at ${header?.branch.name ?? "the branch"}`,
            status: "STK",
            createdById: input.userId,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: "delivery.accepted",
          entityType: "BranchDelivery",
          entityId: input.deliveryId,
          metadata: {
            movedCount: plan.moveSerialIds.length,
            status: finalStatus,
            idempotent: plan.idempotent,
          },
        },
      });
    });
    } catch (error) {
      throw claimError(error);
    }

    return {
      movedCount: plan.moveSerialIds.length,
      idempotent: plan.idempotent,
      status: finalStatus,
    };
  },

  /** Closes a delivery that was never dispatched. Dispatched units go back through a return request. */
  async reject(input: {
    tenantId: string;
    userId: string;
    permissions: string[] | undefined;
    deliveryId: string;
    notes?: string;
  }): Promise<{ returnedCount: number; idempotent: boolean }> {
    const preview = await loadDelivery(input.tenantId, input.deliveryId);
    if (!preview) throw new Error("Delivery not found");
    await authorizeDeliveryScope(input, preview);
    const plan = planReject(preview);
    if (!plan.ok) throw new Error(plan.error);
    if (plan.idempotent) {
      return { returnedCount: 0, idempotent: true };
    }

    const [rejectedCodeId, approvedCodeId] = await Promise.all([
      workflowCodeId(input.tenantId, "rejected"),
      workflowCodeId(input.tenantId, "approved"),
    ]);

    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.branchDelivery.updateMany({
          where: { id: input.deliveryId, tenantId: input.tenantId, statusCodeId: approvedCodeId },
          data: { statusCodeId: rejectedCodeId },
        });
        assertExclusiveClaim(claimed.count, 1, "Delivery could not be rejected");

        await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            action: "delivery.rejected",
            entityType: "BranchDelivery",
            entityId: input.deliveryId,
            metadata: { returnedCount: 0, ...(input.notes ? { notes: input.notes } : {}) },
          },
        });
      });
    } catch (error) {
      throw claimError(error);
    }

    return { returnedCount: 0, idempotent: false };
  },
};
