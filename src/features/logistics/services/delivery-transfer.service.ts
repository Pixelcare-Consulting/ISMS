import type { DeliveryTransferLineStatus, DeliveryTransferStatus } from "@prisma/client";
import { Prisma } from "@/lib/database/generated/prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  assertExclusivePlacement,
  loadCurrentPlacements,
  lockSerialNumbers,
} from "@/features/inventory/services/serial-placement";
import {
  resolveLogisticsCapabilities,
  type LogisticsActionCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { sapTransferNotPostedMessage } from "@/features/logistics/constants/delivery-workflow-labels";
import { assertExclusiveClaim } from "@/features/logistics/services/delivery-posting.planner";
import {
  finalizeDeliveryIfSettled,
  loadDelivery,
} from "@/features/logistics/services/delivery-posting.service";
import { hasOpenReturn, lockDeliveryRow } from "@/features/logistics/services/delivery-settle";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";
import { findOpenTransferLines } from "@/features/logistics/services/delivery-transfer-open-lines";
import {
  defaultTransferPlaces,
  isSapPending,
  nextTransferStatus,
  ON_OPEN_TRANSFER_ERROR,
  planInTransitCancel,
  planLineDecision,
  planRelease,
  planReleasePlace,
  planTransferCreate,
  TRANSFER_RETURN_OPEN_ERROR,
  type TransferPlace,
} from "@/features/logistics/services/delivery-transfer.planner";
import type { PostingActor, PostingDb } from "@/features/logistics/services/posting-support";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { SAP_REFERENCE_TYPES } from "@/features/sap/constants/sap-job-types";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";
import { sapService } from "@/features/sap/services/sap.service";
import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";

/**
 * Unit transfers (UTR) for delivered units the branch did not accept.
 * Separate from TL branch-to-branch transfers: create → per-line approve or
 * delete → release (SAP IT for consignment) → per-line receive moves stock.
 * A failed SAP IT is retried from the transfer page; while SAP has no IT and
 * nothing was received, an approver can cancel the released transfer.
 */

const ENTITY = "DeliveryTransfer";
const REMARKS_MAX = 500;

/** Place picked in the UI. A warehouse on the receive side needs a location. */
export type TransferPlaceInput =
  | { kind: "BRANCH"; id: string }
  | { kind: "WAREHOUSE"; id: string; locationId?: string | null };

export interface TransferPlaceOptions {
  branches: { id: string; name: string; sapCode: string }[];
  warehouses: { id: string; name: string; code: string; locations: { id: string; code: string; name: string }[] }[];
}

export interface DeliveryTransferDraft {
  deliveryId: string;
  deliveryNo: string;
  places: TransferPlaceOptions;
  /** Fixed: the delivery branch (R11). */
  releaseName: string;
  defaults: { release: TransferPlace; receive: TransferPlace | null };
}

export interface DeliveryTransferDetail {
  id: string;
  transferNo: string;
  status: DeliveryTransferStatus;
  createdAt: string;
  createdByName: string | null;
  delivery: { id: string; deliveryNo: string };
  releaseName: string;
  receiveName: string;
  sapDocNo: string | null;
  sapDocDate: string | null;
  sapError: string | null;
  /** Consignment deliveries post an SAP IT on release. */
  postsToSap: boolean;
  /** Released consignment transfer whose SAP IT has not posted: units cannot be accepted yet. */
  sapPending: boolean;
  lines: {
    id: string;
    serialNumberId: string;
    serialNo: string;
    skuCode: string;
    modelName: string;
    remarks: string | null;
    status: DeliveryTransferLineStatus;
  }[];
}

export interface DeliveryTransferListRow {
  id: string;
  transferNo: string;
  status: DeliveryTransferStatus;
  createdAt: string;
  deliveryNo: string;
  releaseName: string;
  receiveName: string;
  unitCount: number;
  sapDocNo: string | null;
  sapError: string | null;
}

type Capability = keyof Pick<
  LogisticsActionCapabilities,
  "canCreateDeliveryTransfer" | "canApproveDeliveryTransfer" | "canReceiveDeliveryTransfer"
>;

const CAPABILITY_ERRORS: Record<Capability, string> = {
  canCreateDeliveryTransfer: "You do not have permission to create unit transfers",
  canApproveDeliveryTransfer: "You do not have permission to approve unit transfers",
  canReceiveDeliveryTransfer: "You do not have permission to receive unit transfers",
};

function requireCapability(actor: PostingActor, capability: Capability) {
  if (!resolveLogisticsCapabilities(actor.permissions)[capability]) {
    throw new Error(CAPABILITY_ERRORS[capability]);
  }
}

function nextTransferNo() {
  return `UTR-${Date.now().toString(36).toUpperCase()}`;
}

function transferError(error: unknown, fallback: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    // Two unique indexes can fire here: the transfer number and the one-open-line-per-serial index.
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
    if (/transfer_?no/i.test(fields)) return new Error("Could not number the transfer. Try again.");
    return new Error(ON_OPEN_TRANSFER_ERROR);
  }
  return error instanceof Error ? error : new Error(fallback);
}

function placeName(input: {
  branch: { name: string } | null;
  warehouse: { name: string } | null;
  location?: { code: string } | null;
}): string {
  if (input.branch) return input.branch.name;
  if (input.warehouse) {
    return input.location ? `${input.warehouse.name} (${input.location.code})` : input.warehouse.name;
  }
  return "Not set";
}

const placeInclude = {
  releaseBranch: { select: { name: true } },
  releaseWarehouse: { select: { name: true } },
  receiveBranch: { select: { name: true } },
  receiveWarehouse: { select: { name: true } },
  receiveWarehouseLocation: { select: { code: true } },
} satisfies Prisma.DeliveryTransferInclude;

/**
 * Validates the picked places against the tenant and returns the columns to
 * store. Release is always the delivery branch, where the units sit DIT (R11).
 */
async function resolvePlaces(
  tenantId: string,
  deliveryBranchId: string,
  release: TransferPlaceInput,
  receive: TransferPlaceInput,
): Promise<{
  releaseBranchId: string | null;
  releaseWarehouseId: string | null;
  receiveBranchId: string | null;
  receiveWarehouseId: string | null;
  receiveWarehouseLocationId: string | null;
}> {
  async function branchExists(id: string) {
    return (await prisma.branch.count({ where: { id, tenantId, deletedAt: null } })) === 1;
  }
  async function warehouseExists(id: string) {
    return (await prisma.warehouse.count({ where: { id, tenantId, deletedAt: null } })) === 1;
  }

  const releasePlan = planReleasePlace(release, deliveryBranchId);
  if (!releasePlan.ok) throw new Error(releasePlan.error);
  if (!(await branchExists(release.id))) throw new Error("Choose a valid branch release");

  let receiveWarehouseLocationId: string | null = null;
  if (receive.kind === "BRANCH") {
    if (!(await branchExists(receive.id))) throw new Error("Choose a valid branch receive");
  } else {
    if (!(await warehouseExists(receive.id))) throw new Error("Choose a valid branch receive");
    if (!receive.locationId) throw new Error("Choose the warehouse location that receives the units");
    const location = await prisma.warehouseLocation.count({
      where: { id: receive.locationId, warehouseId: receive.id },
    });
    if (location !== 1) throw new Error("That location is not in the receiving warehouse");
    receiveWarehouseLocationId = receive.locationId;
  }

  if (release.kind === receive.kind && release.id === receive.id) {
    throw new Error("Release and receive must be different places.");
  }

  return {
    releaseBranchId: release.kind === "BRANCH" ? release.id : null,
    releaseWarehouseId: release.kind === "WAREHOUSE" ? release.id : null,
    receiveBranchId: receive.kind === "BRANCH" ? receive.id : null,
    receiveWarehouseId: receive.kind === "WAREHOUSE" ? receive.id : null,
    receiveWarehouseLocationId,
  };
}

/** Loads a transfer with its delivery, checks it exists, and enforces delivery scope. */
async function loadScopedTransfer(actor: PostingActor, transferId: string) {
  const transfer = await prisma.deliveryTransfer.findFirst({
    where: { id: transferId, tenantId: actor.tenantId },
    select: {
      id: true,
      transferNo: true,
      status: true,
      sapDocEntry: true,
      deliveryId: true,
      delivery: {
        select: {
          branchId: true,
          sourceWarehouseId: true,
          order: { select: { sapDocType: true } },
        },
      },
    },
  });
  if (!transfer) throw new Error("Unit transfer not found");
  await authorizeDeliveryScope(actor, transfer.delivery);
  return transfer;
}

type SapOutcome = { sapDocNo: string | null; sapError: string | null };

async function readSapOutcome(tenantId: string, transferId: string): Promise<SapOutcome> {
  const row = await prisma.deliveryTransfer.findFirst({
    where: { id: transferId, tenantId },
    select: { sapDocNo: true, sapError: true },
  });
  return { sapDocNo: row?.sapDocNo ?? null, sapError: row?.sapError ?? null };
}

/**
 * Queues and runs the transfer's SAP IT inline (only this job). The job's own
 * failure path saves sapError; this catch covers a failure before the job ran.
 * A failed post never undoes the release.
 */
async function postTransferToSap(
  actor: PostingActor,
  transfer: { id: string; transferNo: string },
  requeue: boolean,
) {
  try {
    await sapService.emitDeliveryTransfer(actor.tenantId, { id: transfer.id, transferNo: transfer.transferNo });
    if (requeue) {
      // Also revives a dead-letter job, with a fresh attempt count.
      await sapIntegrationRepository.requeueByReference(actor.tenantId, SAP_REFERENCE_TYPES.DeliveryTransfer, transfer.id);
    }
    await sapService.processPendingJobs(actor.tenantId, actor.userId, 1, {
      referenceType: SAP_REFERENCE_TYPES.DeliveryTransfer,
      referenceId: transfer.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAP posting failed";
    await prisma.deliveryTransfer.updateMany({
      where: { id: transfer.id, tenantId: actor.tenantId, status: "IN_TRANSIT" },
      data: { sapError: message },
    });
    await auditService.log({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "delivery_transfer.sap_emit_failed",
      entityType: ENTITY,
      entityId: transfer.id,
      metadata: { error: message },
    });
  }
}

async function loadScopedLine(actor: PostingActor, lineId: string) {
  const line = await prisma.deliveryTransferLine.findFirst({
    where: { id: lineId, transfer: { tenantId: actor.tenantId } },
    select: { id: true, transferId: true },
  });
  if (!line) throw new Error("Transfer line not found");
  const transfer = await loadScopedTransfer(actor, line.transferId);
  return { line, transfer };
}

/**
 * Row lock on the transfer header. Every transaction that changes lines or the
 * header takes it first, then re-reads, so two line decisions cannot both miss
 * the header change (e.g. the last two receives, or a remove racing release).
 */
async function lockTransferHeader(tx: PostingDb, tenantId: string, transferId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM delivery_transfers WHERE id = ${transferId} AND tenant_id = ${tenantId} FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("Unit transfer not found");
}

/** Moves the header when its lines say so (all removed → CANCELLED, all received → COMPLETED). */
async function settleHeader(tx: PostingDb, transferId: string, current: DeliveryTransferStatus) {
  const lines = await tx.deliveryTransferLine.findMany({ where: { transferId }, select: { status: true } });
  const next = nextTransferStatus(current, lines);
  if (!next) return null;
  const claimed = await tx.deliveryTransfer.updateMany({
    where: { id: transferId, status: current },
    data: { status: next },
  });
  assertExclusiveClaim(claimed.count, 1, "This transfer was updated by someone else");
  return next;
}

export const deliveryTransferService = {
  async listPlaces(actor: PostingActor): Promise<TransferPlaceOptions> {
    requireCapability(actor, "canCreateDeliveryTransfer");
    const [branches, warehouses] = await Promise.all([
      prisma.branch.findMany({
        where: { tenantId: actor.tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, sapCode: true },
      }),
      prisma.warehouse.findMany({
        where: { tenantId: actor.tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          locations: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true } },
        },
      }),
    ]);
    return { branches, warehouses };
  },

  /** Places and defaults for the create dialog; the first selected unit sets the receive location. */
  async prepare(actor: PostingActor, deliveryId: string, serialNumberIds: string[]): Promise<DeliveryTransferDraft> {
    requireCapability(actor, "canCreateDeliveryTransfer");
    const delivery = await loadDelivery(actor.tenantId, deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, delivery);
    const header = await prisma.branchDelivery.findFirst({
      where: { id: deliveryId, tenantId: actor.tenantId },
      select: { deliveryNo: true, branch: { select: { name: true } } },
    });
    const firstLine = delivery.lines.find((line) => line.serialNumberId === serialNumberIds[0]);
    return {
      deliveryId,
      deliveryNo: header?.deliveryNo ?? "",
      places: await this.listPlaces(actor),
      releaseName: header?.branch.name ?? "Delivery branch",
      defaults: defaultTransferPlaces(delivery, firstLine?.warehouseLocationFromId ?? null),
    };
  },

  async list(tenantId: string, pagination?: { page?: number; limit?: number }) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.DeliveryTransferWhereInput = { tenantId };
    const [rows, total] = await Promise.all([
      prisma.deliveryTransfer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          transferNo: true,
          status: true,
          createdAt: true,
          sapDocNo: true,
          sapError: true,
          delivery: { select: { deliveryNo: true } },
          ...placeInclude,
          _count: { select: { lines: { where: { status: { not: "REMOVED" } } } } },
        },
      }),
      prisma.deliveryTransfer.count({ where }),
    ]);
    const items: DeliveryTransferListRow[] = rows.map((row) => ({
      id: row.id,
      transferNo: row.transferNo,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      deliveryNo: row.delivery.deliveryNo,
      releaseName: placeName({ branch: row.releaseBranch, warehouse: row.releaseWarehouse }),
      receiveName: placeName({
        branch: row.receiveBranch,
        warehouse: row.receiveWarehouse,
        location: row.receiveWarehouseLocation,
      }),
      unitCount: row._count.lines,
      sapDocNo: row.sapDocNo,
      sapError: row.sapError,
    }));
    return toPaginatedResult(items, total, page, limit);
  },

  async getDetail(actor: PostingActor, transferId: string): Promise<DeliveryTransferDetail> {
    const scoped = await loadScopedTransfer(actor, transferId);
    const row = await prisma.deliveryTransfer.findFirst({
      where: { id: transferId, tenantId: actor.tenantId },
      select: {
        id: true,
        transferNo: true,
        status: true,
        createdAt: true,
        sapDocEntry: true,
        sapDocNo: true,
        sapDocDate: true,
        sapError: true,
        createdBy: { select: { name: true } },
        delivery: { select: { id: true, deliveryNo: true } },
        ...placeInclude,
        lines: {
          orderBy: { serialNumber: { serialNo: "asc" } },
          select: {
            id: true,
            serialNumberId: true,
            remarks: true,
            status: true,
            serialNumber: { select: { serialNo: true } },
            model: { select: { skuCode: true, name: true } },
          },
        },
      },
    });
    if (!row) throw new Error("Unit transfer not found");
    return {
      id: row.id,
      transferNo: row.transferNo,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy.name || null,
      delivery: row.delivery,
      releaseName: placeName({ branch: row.releaseBranch, warehouse: row.releaseWarehouse }),
      receiveName: placeName({
        branch: row.receiveBranch,
        warehouse: row.receiveWarehouse,
        location: row.receiveWarehouseLocation,
      }),
      sapDocNo: row.sapDocNo,
      sapDocDate: row.sapDocDate ? row.sapDocDate.toISOString().slice(0, 10) : null,
      sapError: row.sapError,
      postsToSap: scoped.delivery.order?.sapDocType === "ITR",
      sapPending: isSapPending({
        sapDocType: scoped.delivery.order?.sapDocType ?? null,
        status: row.status,
        sapDocEntry: row.sapDocEntry,
      }),
      lines: row.lines.map((line) => ({
        id: line.id,
        serialNumberId: line.serialNumberId,
        serialNo: line.serialNumber.serialNo,
        skuCode: line.model.skuCode,
        modelName: line.model.name,
        remarks: line.remarks,
        status: line.status,
      })),
    };
  },

  async create(
    actor: PostingActor,
    input: {
      deliveryId: string;
      release: TransferPlaceInput;
      receive: TransferPlaceInput;
      lines: { serialNumberId: string; remarks?: string | null }[];
    },
  ): Promise<{ id: string; transferNo: string }> {
    requireCapability(actor, "canCreateDeliveryTransfer");
    const delivery = await loadDelivery(actor.tenantId, input.deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    await authorizeDeliveryScope(actor, delivery);

    const serialIds = input.lines.map((line) => line.serialNumberId);
    const [openReturn, openLines] = await Promise.all([
      hasOpenReturn(prisma, actor.tenantId, delivery.id),
      findOpenTransferLines(prisma, actor.tenantId, serialIds),
    ]);
    const lineBySerial = new Map(delivery.lines.map((line) => [line.serialNumberId, line]));
    const held = new Set(openLines.map((row) => row.serialNumberId));
    const plan = planTransferCreate({
      deliveryStatus: delivery.status,
      hasOpenReturn: openReturn,
      units: serialIds.map((serialNumberId) => ({
        serialNumberId,
        branchStatus: lineBySerial.get(serialNumberId)?.branchStatus ?? null,
        onOpenTransfer: held.has(serialNumberId),
      })),
    });
    if (!plan.ok) throw new Error(plan.error);

    const places = await resolvePlaces(actor.tenantId, delivery.branchId, input.release, input.receive);
    const serials = await prisma.serialNumber.findMany({
      where: { tenantId: actor.tenantId, id: { in: serialIds } },
      select: { id: true, modelId: true },
    });
    const modelBySerial = new Map(serials.map((row) => [row.id, row.modelId]));

    try {
      return await prisma.$transaction(async (tx) => {
        await lockSerialNumbers(tx, serialIds);
        // Serials then the delivery row, the order a return request uses: a return
        // opened since the check above is seen here.
        await lockDeliveryRow(tx, actor.tenantId, delivery.id);
        if (await hasOpenReturn(tx, actor.tenantId, delivery.id)) throw new Error(TRANSFER_RETURN_OPEN_ERROR);
        // Re-read under the lock: a concurrent create or accept may have taken a unit.
        const stillHeld = await findOpenTransferLines(tx, actor.tenantId, serialIds);
        if (stillHeld.length > 0) throw new Error(ON_OPEN_TRANSFER_ERROR);
        const inTransit = await tx.branchInventory.count({
          where: {
            tenantId: actor.tenantId,
            branchId: delivery.branchId,
            serialNumberId: { in: serialIds },
            statusCode: { code: "DIT" },
          },
        });
        assertExclusiveClaim(inTransit, serialIds.length, "Only units still in transit on this delivery can be transferred");

        const row = await tx.deliveryTransfer.create({
          data: {
            tenantId: actor.tenantId,
            deliveryId: delivery.id,
            transferNo: nextTransferNo(),
            createdById: actor.userId,
            ...places,
            lines: {
              create: input.lines.map((line) => ({
                serialNumberId: line.serialNumberId,
                modelId: modelBySerial.get(line.serialNumberId) ?? "",
                remarks: line.remarks?.trim().slice(0, REMARKS_MAX) || null,
              })),
            },
          },
          select: { id: true, transferNo: true },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "delivery_transfer.created",
            entityType: ENTITY,
            entityId: row.id,
            metadata: { transferNo: row.transferNo, deliveryId: delivery.id, serialNumberIds: serialIds },
          },
        });
        return row;
      });
    } catch (error) {
      throw transferError(error, "Failed to create the unit transfer");
    }
  },

  async updateLineRemarks(actor: PostingActor, lineId: string, remarks: string) {
    const caps = resolveLogisticsCapabilities(actor.permissions);
    if (!caps.canCreateDeliveryTransfer && !caps.canApproveDeliveryTransfer) {
      throw new Error(CAPABILITY_ERRORS.canCreateDeliveryTransfer);
    }
    const { transfer } = await loadScopedLine(actor, lineId);
    await prisma.$transaction(async (tx) => {
      await lockTransferHeader(tx, actor.tenantId, transfer.id);
      const line = await tx.deliveryTransferLine.findFirst({
        where: { id: lineId },
        select: { status: true, transfer: { select: { status: true } } },
      });
      if (!line) throw new Error("Transfer line not found");
      if (line.transfer.status !== "PENDING_APPROVAL") {
        throw new Error("Remarks can only be changed before the transfer is released");
      }
      if (line.status !== "PENDING") throw new Error("Remarks can only be changed on a pending line");
      await tx.deliveryTransferLine.update({
        where: { id: lineId },
        data: { remarks: remarks.trim().slice(0, REMARKS_MAX) || null },
      });
    });
    return { transferId: transfer.id };
  },

  async decideLine(actor: PostingActor, lineId: string, action: "APPROVE" | "REMOVE") {
    requireCapability(actor, "canApproveDeliveryTransfer");
    const { transfer } = await loadScopedLine(actor, lineId);

    try {
      await prisma.$transaction(async (tx) => {
        await lockTransferHeader(tx, actor.tenantId, transfer.id);
        const line = await tx.deliveryTransferLine.findFirst({
          where: { id: lineId },
          select: { status: true, serialNumberId: true, transfer: { select: { status: true } } },
        });
        if (!line) throw new Error("Transfer line not found");
        const plan = planLineDecision(line, action, line.transfer.status);
        if (!plan.ok) throw new Error(plan.error);

        const claimed = await tx.deliveryTransferLine.updateMany({
          where: { id: lineId, status: line.status, transfer: { status: line.transfer.status } },
          data: { status: plan.next, decidedById: actor.userId, decidedAt: new Date() },
        });
        assertExclusiveClaim(claimed.count, 1, "This line was updated by someone else");
        const headerStatus = await settleHeader(tx, transfer.id, line.transfer.status);

        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: action === "APPROVE" ? "delivery_transfer.line_approved" : "delivery_transfer.line_removed",
            entityType: ENTITY,
            entityId: transfer.id,
            metadata: {
              transferNo: transfer.transferNo,
              lineId,
              serialNumberId: line.serialNumberId,
              ...(headerStatus ? { status: headerStatus } : {}),
            },
          },
        });
      });
    } catch (error) {
      throw transferError(error, "Failed to update the transfer line");
    }
    return { transferId: transfer.id };
  },

  /**
   * Approved lines go in transit. Consignment deliveries then post an SAP IT;
   * a failed post never undoes the release: the error shows on the transfer and
   * an approver retries it there (retrySap) or cancels the transfer.
   */
  async release(actor: PostingActor, transferId: string): Promise<{ sapDocNo: string | null; sapError: string | null }> {
    requireCapability(actor, "canApproveDeliveryTransfer");
    const transfer = await loadScopedTransfer(actor, transferId);

    try {
      await prisma.$transaction(async (tx) => {
        await lockTransferHeader(tx, actor.tenantId, transferId);
        const header = await tx.deliveryTransfer.findFirst({ where: { id: transferId }, select: { status: true } });
        if (header?.status !== "PENDING_APPROVAL") throw new Error("This transfer has already been released");
        const lines = await tx.deliveryTransferLine.findMany({ where: { transferId }, select: { status: true } });
        const plan = planRelease(lines);
        if (!plan.ok) throw new Error(plan.error);
        const claimed = await tx.deliveryTransfer.updateMany({
          where: { id: transferId, tenantId: actor.tenantId, status: "PENDING_APPROVAL" },
          data: { status: "IN_TRANSIT" },
        });
        assertExclusiveClaim(claimed.count, 1, "This transfer was updated by someone else");
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "delivery_transfer.released",
            entityType: ENTITY,
            entityId: transferId,
            metadata: {
              transferNo: transfer.transferNo,
              approvedCount: lines.filter((line) => line.status === "APPROVED").length,
            },
          },
        });
      });
    } catch (error) {
      throw transferError(error, "Failed to release the transfer");
    }

    // Outright deliveries have no SAP document for a unit transfer (D5).
    if (transfer.delivery.order?.sapDocType === "ITR") await postTransferToSap(actor, transfer, false);
    return readSapOutcome(actor.tenantId, transferId);
  },

  /** Re-queues the SAP IT of a released consignment transfer that did not post, then runs it. */
  async retrySap(actor: PostingActor, transferId: string): Promise<SapOutcome> {
    requireCapability(actor, "canApproveDeliveryTransfer");
    const transfer = await loadScopedTransfer(actor, transferId);
    if (transfer.delivery.order?.sapDocType !== "ITR") throw new Error("This transfer does not post to SAP");
    if (transfer.status !== "IN_TRANSIT" || transfer.sapDocEntry != null) {
      throw new Error("Only a released transfer waiting for SAP can be retried");
    }
    await postTransferToSap(actor, transfer, true);
    return readSapOutcome(actor.tenantId, transferId);
  },

  /**
   * Calls off a released transfer before anything moved (no SAP IT, nothing
   * received): approved lines are removed, the units stay DIT on the delivery,
   * and the queued SAP job is retired in the same transaction.
   */
  async cancelInTransit(actor: PostingActor, transferId: string): Promise<{ transferId: string }> {
    requireCapability(actor, "canApproveDeliveryTransfer");
    const transfer = await loadScopedTransfer(actor, transferId);

    try {
      await prisma.$transaction(async (tx) => {
        await lockTransferHeader(tx, actor.tenantId, transferId);
        const header = await tx.deliveryTransfer.findFirst({
          where: { id: transferId },
          select: { status: true, sapDocEntry: true },
        });
        if (!header) throw new Error("Unit transfer not found");
        const lines = await tx.deliveryTransferLine.findMany({ where: { transferId }, select: { status: true } });
        const plan = planInTransitCancel({ ...header, lines });
        if (!plan.ok) throw new Error(plan.error);

        const ref = [actor.tenantId, SAP_REFERENCE_TYPES.DeliveryTransfer, transferId] as const;
        // Retire the job first: a worker that claimed it before this point is seen below.
        await sapIntegrationRepository.deadLetterByReference(...ref, "Unit transfer cancelled in ISMS", tx);
        if ((await sapIntegrationRepository.countInFlight(...ref, tx)) > 0) {
          throw new Error("SAP is posting this transfer right now. Try again in a minute.");
        }

        const claimed = await tx.deliveryTransfer.updateMany({
          where: { id: transferId, tenantId: actor.tenantId, status: "IN_TRANSIT", sapDocEntry: null },
          data: { status: "CANCELLED", sapError: null },
        });
        assertExclusiveClaim(claimed.count, 1, "This transfer was updated by someone else");
        const removed = await tx.deliveryTransferLine.updateMany({
          where: { transferId, status: "APPROVED" },
          data: { status: "REMOVED", decidedById: actor.userId, decidedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "delivery_transfer.cancelled_in_transit",
            entityType: ENTITY,
            entityId: transferId,
            metadata: { transferNo: transfer.transferNo, removedCount: removed.count },
          },
        });
      });
    } catch (error) {
      throw transferError(error, "Failed to cancel the transfer");
    }
    return { transferId };
  },

  /** One unit arrives: stock moves to the receive place in the same transaction. */
  async receiveLine(actor: PostingActor, lineId: string): Promise<{ transferId: string; status: DeliveryTransferStatus }> {
    requireCapability(actor, "canReceiveDeliveryTransfer");
    const { transfer } = await loadScopedLine(actor, lineId);
    const delivery = transfer.delivery;
    const [ditCodeId, stkCodeId] = await Promise.all([
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "DIT"),
      reasonStatusService.requireCodeId(actor.tenantId, "inventory_system", "STK"),
    ]);

    try {
      return await prisma.$transaction(async (tx) => {
        await lockTransferHeader(tx, actor.tenantId, transfer.id);
        const line = await tx.deliveryTransferLine.findFirst({
          where: { id: lineId },
          select: {
            status: true,
            serialNumberId: true,
            transfer: {
              select: {
                status: true,
                transferNo: true,
                sapDocEntry: true,
                sapError: true,
                deliveryId: true,
                receiveBranchId: true,
                receiveWarehouseLocationId: true,
                ...placeInclude,
              },
            },
          },
        });
        if (!line) throw new Error("Transfer line not found");
        const header = line.transfer;
        const plan = planLineDecision(line, "RECEIVE", header.status);
        if (!plan.ok) throw new Error(plan.error);
        // Consignment: SAP must have the IT before ISMS stock moves at the receiving place.
        if (delivery.order?.sapDocType === "ITR" && header.sapDocEntry == null) {
          throw new Error(sapTransferNotPostedMessage(header.sapError));
        }

        const serialNumberId = line.serialNumberId;
        await lockSerialNumbers(tx, [serialNumberId]);
        // The unit is physically DIT on the delivery branch shelf, whatever the release place is called.
        const placements = await loadCurrentPlacements(tx, [serialNumberId]);
        const shelf = placements.find(
          (row) => row.table === "branch" && row.branchId === delivery.branchId && row.statusCode === "DIT",
        );
        if (!shelf) throw new Error("This unit is no longer in transit at the delivery branch");
        assertExclusivePlacement({ placements, replacingIds: [shelf.id] });

        const place = placeName({
          branch: header.receiveBranch,
          warehouse: header.receiveWarehouse,
          location: header.receiveWarehouseLocation,
        });
        let historyStatus: "STK" | "Warehouse";
        if (header.receiveBranchId) {
          const moved = await tx.branchInventory.updateMany({
            where: { id: shelf.id, statusCodeId: ditCodeId },
            data: { branchId: header.receiveBranchId, statusCodeId: stkCodeId, updatedById: actor.userId },
          });
          assertExclusiveClaim(moved.count, 1, "This unit is no longer in transit at the delivery branch");
          historyStatus = "STK";
        } else if (header.receiveWarehouseLocationId) {
          const removed = await tx.branchInventory.deleteMany({ where: { id: shelf.id, statusCodeId: ditCodeId } });
          assertExclusiveClaim(removed.count, 1, "This unit is no longer in transit at the delivery branch");
          await tx.warehouseInventory.create({
            data: {
              tenantId: actor.tenantId,
              serialNumberId,
              warehouseLocationId: header.receiveWarehouseLocationId,
              systemStatus: "Received from unit transfer",
              systemUpdatedAt: new Date(),
            },
          });
          historyStatus = "Warehouse";
        } else {
          throw new Error("This transfer has no receiving location");
        }

        const claimed = await tx.deliveryTransferLine.updateMany({
          where: { id: lineId, status: "APPROVED" },
          data: { status: plan.next, decidedById: actor.userId, decidedAt: new Date() },
        });
        assertExclusiveClaim(claimed.count, 1, "This line was updated by someone else");
        const headerStatus = (await settleHeader(tx, transfer.id, header.status)) ?? header.status;

        await tx.serialNumberHistory.create({
          data: {
            tenantId: actor.tenantId,
            serialNumberId,
            txnType: "transfer",
            details: `Received on ${header.transferNo} at ${place}`,
            status: historyStatus,
            createdById: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "delivery_transfer.line_received",
            entityType: ENTITY,
            entityId: transfer.id,
            metadata: { transferNo: header.transferNo, lineId, serialNumberId, place, status: headerStatus },
          },
        });
        await finalizeDeliveryIfSettled(tx, actor.tenantId, header.deliveryId);
        return { transferId: transfer.id, status: headerStatus };
      });
    } catch (error) {
      throw transferError(error, "Failed to receive the unit");
    }
  },
};
