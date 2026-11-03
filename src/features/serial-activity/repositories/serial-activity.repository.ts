import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import { STOCK_COUNT_SESSION_LABELS } from "@/features/stock-audit/constants/stock-count-workflow";
import { formatPeso } from "@/utils/format-currency";
import {
  DELIVERY_RETURN_STATUS_LABELS,
  DELIVERY_TRANSFER_LINE_STATUS_LABELS,
  DELIVERY_TRANSFER_STATUS_LABELS,
  returnSapFailedMessage,
} from "@/features/logistics/constants/delivery-workflow-labels";
import {
  SERIAL_ACTIVITY_LABELS,
  SERIAL_ACTIVITY_TYPES,
  type SerialActivityEvent,
  type SerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";
import {
  approvalReferenceLines,
  approverIds,
  approverName,
  auditTrailLines,
  decisionReferenceLine,
  type ApproverRef,
  type AuditTrailEntry,
} from "@/features/serial-activity/lib/approval-reference";
import {
  DELIVERY_RETURN_HISTORY_PREFIX,
  documentReferenceFromHistoryDetails,
  historyActivityForTxn,
  historyTxnTypesForActivity,
  returnRequestIdFromHistoryDetails,
} from "@/features/serial-activity/lib/serial-history-log";

export type SerialActivitySortDir = "asc" | "desc";

interface ListParams {
  page?: number;
  limit?: number;
  type?: SerialActivityType;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sortDir?: SerialActivitySortDir;
}

interface SourceResult {
  events: SerialActivityEvent[];
  count: number;
}

interface SourceOptions {
  window: number;
  q?: string;
  dateFilter?: Prisma.DateTimeFilter;
  dir: SerialActivitySortDir;
}

/** Local-day boundary: start → 00:00:00.000, end → 23:59:59.999. */
function parseDateBoundary(value: string, boundary: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (boundary === "start") {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function buildDateFilter(
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: parseDateBoundary(dateFrom, "start") } : {}),
    ...(dateTo ? { lte: parseDateBoundary(dateTo, "end") } : {}),
  };
}

const modelSelect = {
  select: { skuCode: true, name: true },
} as const;

function modelLabel(model: { skuCode: string; name: string }): string {
  return `${model.skuCode} — ${model.name}`;
}

type SerialRef = {
  serialNo: string;
  model: { skuCode: string; name: string };
} | null;

/** Skip orphaned FK rows where the related serial was deleted. */
function serialFields(serial: SerialRef): {
  serialNo: string;
  modelLabel: string;
} | null {
  if (!serial) return null;
  return {
    serialNo: serial.serialNo,
    modelLabel: modelLabel(serial.model),
  };
}

const userSelect = {
  select: { name: true, email: true },
} as const;

const approvalLevelSelect = {
  select: {
    level: true,
    roleSlug: true,
    approvedAt: true,
    approvedById: true,
    rejectedAt: true,
    rejectedById: true,
    comment: true,
  },
  orderBy: { level: "asc" },
} as const;

/**
 * Approvers by id, in one query. Transfer and pull-out levels store only the id, with no
 * relation to load through. Deleted users are kept: the approval still happened.
 */
async function loadApprovers(
  tenantId: string,
  ids: string[],
): Promise<Map<string, ApproverRef>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user) => [user.id, { name: user.name, email: user.email }]));
}

/**
 * Audit-log steps of the given documents, grouped by document id, for the
 * workflows whose decisions are kept only there.
 */
async function loadAuditTrails(
  tenantId: string,
  entityIds: string[],
  actions: readonly string[],
): Promise<Map<string, AuditTrailEntry[]>> {
  const trails = new Map<string, AuditTrailEntry[]>();
  const ids = [...new Set(entityIds)];
  if (ids.length === 0) return trails;
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, entityId: { in: ids }, action: { in: [...actions] } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, action: true, createdAt: true, metadata: true, user: userSelect },
  });
  for (const row of rows) {
    if (!row.entityId) continue;
    const metadata = auditMetadataRecord(row.metadata);
    const entry: AuditTrailEntry = {
      action: row.action,
      at: row.createdAt,
      by: row.user,
      lineId: auditMetadataString(metadata, "lineId"),
      note: auditMetadataString(metadata, "note"),
    };
    trails.set(row.entityId, [...(trails.get(row.entityId) ?? []), entry]);
  }
  return trails;
}

const RECORD_STATUS_LABELS: Record<string, string> = {
  active: "Record: Active",
  inactive: "Record: Inactive",
};

const COUNT_LINE_STATUS_LABELS: Record<string, string> = {
  pending: "Count: Pending",
  counted: "Count: Counted",
  variance: "Count: Variance",
  resolved: "Count: Resolved",
};

/** Drops empty/blank entries so reference cells never render dangling separators. */
function referenceDetails(...parts: (string | null | undefined)[]): string[] {
  return parts.filter((part): part is string => Boolean(part && part.trim()));
}

function route(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Date-only label for reference lines (the timestamp column carries the time). */
function formatEventDate(value: Date): string {
  return value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function performedByLabel(
  user: { name: string | null; email: string } | null,
): { name: string | null; email: string } | null {
  return user ? { name: user.name, email: user.email } : null;
}

/**
 * Registered LOCATION must stay historical. `BranchInventory.branchId` is relocated
 * in place (Official Sales ADD/DEL, transfers), so never treat current inventory
 * branch as the registration site when placement history exists.
 *
 * Prefer immutable first-placement signals, then fall back to live inventory.
 */
function registeredLocation(row: {
  deliveryLines: { delivery: { branch: { name: string } } }[];
  transferLines: { transfer: { fromBranch: { name: string } } }[];
  salesDetails: {
    sale: { stockSourceBranch: { name: string } | null };
  }[];
  branchInventories: { branch: { name: string } }[];
}): string | null {
  return (
    row.deliveryLines[0]?.delivery.branch.name ??
    row.transferLines[0]?.transfer.fromBranch.name ??
    row.salesDetails[0]?.sale.stockSourceBranch?.name ??
    row.branchInventories[0]?.branch.name ??
    null
  );
}

/** Case-insensitive `contains` fragment (or empty when no query). */
function textContains(q?: string) {
  return q ? { contains: q, mode: "insensitive" as const } : undefined;
}

async function registeredSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.SerialNumberWhereInput = {
    tenantId,
    ...(q ? { serialNo: textContains(q) } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.serialNumber.findMany({
      where,
      orderBy: { createdAt: dir },
      take: window,
      select: {
        id: true,
        serialNo: true,
        createdAt: true,
        recordStatus: true,
        model: modelSelect,
        createdBy: userSelect,
        // Earliest delivery = first branch the unit was shipped to (immutable).
        deliveryLines: {
          take: 1,
          orderBy: { delivery: { createdAt: "asc" } },
          select: {
            delivery: { select: { branch: { select: { name: true } } } },
          },
        },
        // Earliest transfer from-branch = where it sat before the first move.
        transferLines: {
          take: 1,
          orderBy: { transfer: { createdAt: "asc" } },
          select: {
            transfer: {
              select: { fromBranch: { select: { name: true } } },
            },
          },
        },
        // Cross-branch sale stock source (alternateBranchId) — set at encode time.
        salesDetails: {
          take: 1,
          orderBy: { createdAt: "asc" },
          where: { sale: { alternateBranchId: { not: null } } },
          select: {
            sale: {
              select: {
                stockSourceBranch: { select: { name: true } },
              },
            },
          },
        },
        // Last resort only — branchId on this row is live and may have relocated.
        branchInventories: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { branch: { select: { name: true } } },
        },
      },
    }),
    prisma.serialNumber.count({ where }),
  ]);
  return {
    count,
    events: rows.map((r) => ({
      id: `registered:${r.id}`,
      type: "registered",
      timestamp: r.createdAt,
      serialNo: r.serialNo,
      modelLabel: modelLabel(r.model),
      location: registeredLocation(r),
      reference: r.serialNo,
      referenceDetails: referenceDetails(`SKU ${r.model.skuCode}`),
      status: RECORD_STATUS_LABELS[r.recordStatus] ?? r.recordStatus,
      performedBy: performedByLabel(r.createdBy),
    })),
  };
}

async function statusSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchInventoryWhereInput = {
    tenantId,
    ...(q ? { serialNumber: { serialNo: textContains(q) } } : {}),
    ...(dateFilter ? { updatedAt: dateFilter } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchInventory.findMany({
      where,
      orderBy: { updatedAt: dir },
      take: window,
      select: {
        id: true,
        updatedAt: true,
        branch: { select: { name: true } },
        statusCode: { select: { code: true, name: true } },
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        updatedBy: userSelect,
      },
    }),
    prisma.branchInventory.count({ where }),
  ]);
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      return [
        {
          id: `status:${r.id}`,
          type: "status" as const,
          timestamp: r.updatedAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: r.branch.name,
          reference: null,
          referenceDetails: referenceDetails(
            `Status set to ${r.statusCode.name} (${r.statusCode.code})`,
          ),
          status: `Inventory: ${r.statusCode.name}`,
          performedBy: performedByLabel(r.updatedBy),
        },
      ];
    }),
  };
}

async function transferredSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchTransferLineWhereInput = {
    transfer: { tenantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { transfer: { transferNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchTransferLine.findMany({
      where,
      orderBy: { transfer: { createdAt: dir } },
      take: window,
      select: {
        id: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        transfer: {
          select: {
            transferNo: true,
            createdAt: true,
            notes: true,
            fromBranch: { select: { name: true } },
            toBranch: { select: { name: true } },
            statusCode: { select: { name: true } },
            createdBy: userSelect,
            approvalLevels: approvalLevelSelect,
          },
        },
      },
    }),
    prisma.branchTransferLine.count({ where }),
  ]);
  const approvers = await loadApprovers(
    tenantId,
    approverIds(rows.map((r) => r.transfer.approvalLevels)),
  );
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      return [
        {
          id: `transferred:${r.id}`,
          type: "transferred" as const,
          timestamp: r.transfer.createdAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: r.transfer.toBranch.name,
          reference: r.transfer.transferNo,
          referenceDetails: referenceDetails(
            route(r.transfer.fromBranch.name, r.transfer.toBranch.name),
            r.transfer.notes ? `Note: ${r.transfer.notes}` : null,
            ...approvalReferenceLines(r.transfer.approvalLevels, approvers),
          ),
          status: `Transfer: ${r.transfer.statusCode.name}`,
          performedBy: performedByLabel(r.transfer.createdBy),
        },
      ];
    }),
  };
}

async function soldSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchSalesTransactionDetailWhereInput = {
    sale: {
      tenantId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    // Official Sold (OFS) lifecycle is append-only via AuditLog ADD/DEL/WHSE_ADD.
    NOT: { statusCode: { code: { equals: "OFS", mode: "insensitive" } } },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { sale: { transactionNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchSalesTransactionDetail.findMany({
      where,
      orderBy: { createdAt: dir },
      take: window,
      select: {
        id: true,
        createdAt: true,
        saleAmount: true,
        amount: true,
        deliveryNo: true,
        sale: {
          select: {
            transactionNo: true,
            transactionDate: true,
            customerName: true,
            contactNo: true,
            amount: true,
            branch: { select: { name: true } },
            createdBy: userSelect,
          },
        },
        // Reserved sales have no sale.reserved flag — createSaleAction sets
        // inventory status to RSV (vs SLD). atrStatus "reserve" is ATR return only.
        serialNumber: {
          select: {
            serialNo: true,
            model: modelSelect,
            branchInventories: {
              take: 1,
              orderBy: { updatedAt: "desc" },
              select: { statusCode: { select: { code: true } } },
            },
          },
        },
      },
    }),
    prisma.branchSalesTransactionDetail.count({ where }),
  ]);
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      const inventoryCode =
        r.serialNumber?.branchInventories[0]?.statusCode.code ?? null;
      return [
        {
          id: `sold:${r.id}`,
          type: "sold" as const,
          timestamp: r.createdAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: r.sale.branch.name,
          reference: r.sale.transactionNo,
          referenceDetails: referenceDetails(
            formatPeso(Number(r.saleAmount ?? r.amount ?? r.sale.amount)),
            r.sale.customerName ? `Customer: ${r.sale.customerName}` : null,
            r.sale.contactNo ? `Contact: ${r.sale.contactNo}` : null,
            r.deliveryNo ? `DR ${r.deliveryNo}` : null,
            r.sale.transactionDate
              ? `Transaction date: ${formatEventDate(r.sale.transactionDate)}`
              : null,
          ),
          status:
            inventoryCode === "RSV"
              ? "Inventory: Reserved"
              : "Inventory: Sold",
          performedBy: performedByLabel(r.sale.createdBy),
        },
      ];
    }),
  };
}

async function pulledOutSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchPulloutLineWhereInput = {
    pullout: { tenantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { pullout: { pulloutNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchPulloutLine.findMany({
      where,
      orderBy: { pullout: { createdAt: dir } },
      take: window,
      select: {
        id: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        pullout: {
          select: {
            pulloutNo: true,
            createdAt: true,
            waybillNo: true,
            notes: true,
            branch: { select: { name: true } },
            warehouse: { select: { name: true } },
            warehouseLocation: { select: { code: true } },
            statusCode: { select: { name: true } },
            reasonStatusCode: { select: { name: true } },
            createdBy: userSelect,
            approvalLevels: approvalLevelSelect,
          },
        },
      },
    }),
    prisma.branchPulloutLine.count({ where }),
  ]);
  const approvers = await loadApprovers(
    tenantId,
    approverIds(rows.map((r) => r.pullout.approvalLevels)),
  );
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      return [
        {
          id: `pulled_out:${r.id}`,
          type: "pulled_out" as const,
          timestamp: r.pullout.createdAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: r.pullout.warehouseLocation
            ? `${r.pullout.warehouse.name} · ${r.pullout.warehouseLocation.code}`
            : r.pullout.warehouse.name,
          reference: r.pullout.pulloutNo,
          referenceDetails: referenceDetails(
            route(r.pullout.branch.name, r.pullout.warehouse.name),
            r.pullout.reasonStatusCode
              ? `Reason: ${r.pullout.reasonStatusCode.name}`
              : null,
            r.pullout.waybillNo ? `Waybill ${r.pullout.waybillNo}` : null,
            r.pullout.notes ? `Note: ${r.pullout.notes}` : null,
            ...approvalReferenceLines(r.pullout.approvalLevels, approvers),
          ),
          status: `Pullout: ${r.pullout.statusCode.name}`,
          performedBy: performedByLabel(r.pullout.createdBy),
        },
      ];
    }),
  };
}

/** Unit-transfer steps the audit log keeps; line steps carry `lineId` in metadata. */
const UNIT_TRANSFER_TRAIL_LABELS: Record<string, string> = {
  "delivery_transfer.line_approved": "Approved",
  "delivery_transfer.line_removed": "Removed",
  "delivery_transfer.released": "Released",
  "delivery_transfer.cancelled_in_transit": "Cancelled in transit",
  "delivery_transfer.line_received": "Received",
};

function placeLabel(
  branch: { name: string } | null,
  warehouse: { name: string } | null,
  location?: { code: string } | null,
): string | null {
  if (branch) return branch.name;
  if (!warehouse) return null;
  return location ? `${warehouse.name} · ${location.code}` : warehouse.name;
}

/** Units moved off a delivery on a unit transfer (UTR), with each line's approval trail. */
async function unitTransferSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.DeliveryTransferLineWhereInput = {
    transfer: { tenantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { transfer: { transferNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.deliveryTransferLine.findMany({
      where,
      orderBy: { transfer: { createdAt: dir } },
      take: window,
      select: {
        id: true,
        status: true,
        remarks: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        transfer: {
          select: {
            id: true,
            transferNo: true,
            status: true,
            createdAt: true,
            sapDocNo: true,
            delivery: { select: { deliveryNo: true } },
            releaseBranch: { select: { name: true } },
            releaseWarehouse: { select: { name: true } },
            receiveBranch: { select: { name: true } },
            receiveWarehouse: { select: { name: true } },
            receiveWarehouseLocation: { select: { code: true } },
            createdBy: userSelect,
          },
        },
      },
    }),
    prisma.deliveryTransferLine.count({ where }),
  ]);
  const trails = await loadAuditTrails(
    tenantId,
    rows.map((r) => r.transfer.id),
    Object.keys(UNIT_TRANSFER_TRAIL_LABELS),
  );
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      const { transfer } = r;
      const from = placeLabel(transfer.releaseBranch, transfer.releaseWarehouse);
      const to = placeLabel(
        transfer.receiveBranch,
        transfer.receiveWarehouse,
        transfer.receiveWarehouseLocation,
      );
      return [
        {
          id: `unit_transfer:${r.id}`,
          type: "transferred" as const,
          typeLabel: "Unit transfer",
          timestamp: transfer.createdAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: to,
          reference: transfer.transferNo,
          referenceDetails: referenceDetails(
            from && to ? route(from, to) : null,
            `Delivery ${transfer.delivery.deliveryNo}`,
            transfer.sapDocNo ? `SAP IT ${transfer.sapDocNo}` : null,
            r.remarks ? `Note: ${r.remarks}` : null,
            ...auditTrailLines(trails.get(transfer.id) ?? [], UNIT_TRANSFER_TRAIL_LABELS, r.id),
          ),
          status: `Transfer: ${DELIVERY_TRANSFER_STATUS_LABELS[transfer.status]} · Unit: ${DELIVERY_TRANSFER_LINE_STATUS_LABELS[r.status]}`,
          performedBy: performedByLabel(transfer.createdBy),
        },
      ];
    }),
  };
}

/** Delivery return steps; a TL "cancel" of a pending request is the rejection. */
const DELIVERY_RETURN_TRAIL_LABELS: Record<string, string> = {
  "delivery_return.approved": "Approved",
  "delivery_return.cancelled": "Rejected",
  "delivery_return.cancelled_after_approval": "Cancelled after approval",
  "delivery_return.completed": "Posted to SAP",
};

/**
 * Units rejected on arrival and sent back to the warehouse (RTN), listed from the
 * request so pending and rejected requests show too, with the approval trail.
 */
async function deliveryReturnSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.DeliveryReturnLineWhereInput = {
    returnRequest: { tenantId, ...(dateFilter ? { requestedAt: dateFilter } : {}) },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { returnRequest: { requestNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.deliveryReturnLine.findMany({
      where,
      orderBy: { returnRequest: { requestedAt: dir } },
      take: window,
      select: {
        id: true,
        remarks: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        warehouseLocationTo: { select: { code: true, warehouse: { select: { name: true } } } },
        returnRequest: {
          select: {
            id: true,
            requestNo: true,
            status: true,
            reason: true,
            requestedAt: true,
            sapDocNo: true,
            sapError: true,
            requestedBy: userSelect,
            delivery: {
              select: {
                deliveryNo: true,
                branch: { select: { name: true } },
                sourceWarehouse: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.deliveryReturnLine.count({ where }),
  ]);
  const trails = await loadAuditTrails(
    tenantId,
    rows.map((r) => r.returnRequest.id),
    Object.keys(DELIVERY_RETURN_TRAIL_LABELS),
  );
  return {
    count,
    events: rows.flatMap((r) => {
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      const request = r.returnRequest;
      const destination = r.warehouseLocationTo
        ? `${r.warehouseLocationTo.warehouse.name} · ${r.warehouseLocationTo.code}`
        : request.delivery.sourceWarehouse?.name ?? null;
      return [
        {
          id: `delivery_return:${r.id}`,
          type: "transferred" as const,
          typeLabel: "Delivery return",
          timestamp: request.requestedAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: destination,
          reference: request.requestNo,
          referenceDetails: referenceDetails(
            destination ? route(request.delivery.branch.name, destination) : null,
            `Delivery ${request.delivery.deliveryNo}`,
            `Reason: ${r.remarks?.trim() || request.reason}`,
            request.sapDocNo ? `SAP ${request.sapDocNo}` : null,
            request.status === "APPROVED" && request.sapError
              ? returnSapFailedMessage(request.sapError)
              : null,
            ...auditTrailLines(trails.get(request.id) ?? [], DELIVERY_RETURN_TRAIL_LABELS),
          ),
          status: `Return: ${DELIVERY_RETURN_STATUS_LABELS[request.status]}`,
          performedBy: performedByLabel(request.requestedBy),
        },
      ];
    }),
  };
}

const OFFICIAL_SALES_AUDIT_ACTIONS = [
  "official_sales.add",
  "official_sales.del",
  "official_sales.whse_add",
  "official_sales.stock_adj",
] as const;

const OFFICIAL_SALES_ACTION_KEY_LABEL: Record<
  (typeof OFFICIAL_SALES_AUDIT_ACTIONS)[number],
  "ADD" | "DEL" | "WHSE_ADD"
> = {
  "official_sales.add": "ADD",
  "official_sales.del": "DEL",
  "official_sales.whse_add": "WHSE_ADD",
  // stock_adj carries Action Key in metadata.action / actionKey (ADD / DEL / WHSE_ADD)
  "official_sales.stock_adj": "ADD",
};

function auditMetadataRecord(
  metadata: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function auditMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function officialSalesActionKey(
  action: (typeof OFFICIAL_SALES_AUDIT_ACTIONS)[number],
  metadata: Record<string, unknown> | null,
): "ADD" | "DEL" | "WHSE_ADD" {
  const fromMeta = auditMetadataString(metadata, "actionKey")?.toUpperCase();
  if (fromMeta === "ADD" || fromMeta === "DEL" || fromMeta === "WHSE_ADD") {
    return fromMeta;
  }
  // stock_adj audits historically used metadata.action (ADD / DEL / WHSE_ADD)
  const fromAction = auditMetadataString(metadata, "action")?.toUpperCase();
  if (fromAction === "ADD" || fromAction === "DEL" || fromAction === "WHSE_ADD") {
    return fromAction;
  }
  return OFFICIAL_SALES_ACTION_KEY_LABEL[action];
}

/**
 * Append-only Official Sales ADD/DEL/WHSE_ADD/stock_adj trail from AuditLog so
 * cycles remain visible after sale details are hard-deleted.
 */
async function officialSalesAuditSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  // Resolve serial matches first — Prisma JSON `string_contains` is brittle and
  // case-sensitive; catalog lookup keeps Serial Number Logs search reliable.
  const serialMatches = q
    ? await prisma.serialNumber.findMany({
        where: { tenantId, serialNo: textContains(q) },
        select: { serialNo: true },
        take: 200,
      })
    : [];

  const searchOr: Prisma.AuditLogWhereInput[] | undefined = q
    ? [
        ...serialMatches.map((row) => ({
          metadata: {
            path: ["serial"],
            equals: row.serialNo,
          },
        })),
        {
          metadata: {
            path: ["serial"],
            string_contains: q,
          },
        },
        {
          metadata: {
            path: ["transactionNo"],
            string_contains: q,
          },
        },
        { entityId: { contains: q, mode: "insensitive" as const } },
      ]
    : undefined;

  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    action: { in: [...OFFICIAL_SALES_AUDIT_ACTIONS] },
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(searchOr ? { OR: searchOr } : {}),
  };

  const [rows, count] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: dir },
      take: window,
      select: {
        id: true,
        action: true,
        entityId: true,
        createdAt: true,
        metadata: true,
        user: userSelect,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const serialNos = Array.from(
    new Set(
      rows
        .map((row) =>
          auditMetadataString(auditMetadataRecord(row.metadata), "serial"),
        )
        .filter((serial): serial is string => Boolean(serial)),
    ),
  );

  const serialModels =
    serialNos.length === 0
      ? []
      : await prisma.serialNumber.findMany({
          where: {
            tenantId,
            serialNo: { in: serialNos },
          },
          select: {
            serialNo: true,
            model: modelSelect,
          },
        });
  const modelBySerial = new Map(
    serialModels.map((row) => [row.serialNo, modelLabel(row.model)]),
  );

  const qLower = q?.toLowerCase();

  return {
    count,
    events: rows.flatMap((row) => {
      const metadata = auditMetadataRecord(row.metadata);
      const serialNo = auditMetadataString(metadata, "serial");
      if (!serialNo) return [];

      const transactionNo = auditMetadataString(metadata, "transactionNo");
      const previousStatus = auditMetadataString(metadata, "previousStatus");
      const restoredBranch = auditMetadataString(metadata, "restoredBranch");
      const soldBranch = auditMetadataString(metadata, "soldBranch");
      const whseFrom = auditMetadataString(metadata, "whseFrom");
      const whseTo = auditMetadataString(metadata, "whseTo");
      const toFollowCleanup = metadata?.toFollowCleanup === true;

      // Keep serial / transaction / entityId hits; drop unrelated JSON contains noise.
      if (
        qLower &&
        !serialNo.toLowerCase().includes(qLower) &&
        !(transactionNo?.toLowerCase().includes(qLower) ?? false) &&
        !(row.entityId?.toLowerCase().includes(qLower) ?? false)
      ) {
        return [];
      }

      const action =
        row.action as (typeof OFFICIAL_SALES_AUDIT_ACTIONS)[number];
      const actionKey = officialSalesActionKey(action, metadata);
      const isStockAdj = action === "official_sales.stock_adj";
      const typeLabel = isStockAdj
        ? "Official Sales Stock Adj"
        : `Official Sales ${actionKey}`;

      let statusLabel: string;
      switch (action) {
        case "official_sales.del":
          statusLabel = toFollowCleanup
            ? `Action Key: ${actionKey} · TO-FOLLOW removed`
            : previousStatus
              ? `Action Key: ${actionKey} · ${previousStatus} → STK`
              : `Action Key: ${actionKey}`;
          break;
        case "official_sales.add":
          statusLabel = `Action Key: ${actionKey} · Official Sold`;
          break;
        case "official_sales.whse_add":
          statusLabel = `Action Key: ${actionKey} · Official Sold`;
          break;
        case "official_sales.stock_adj":
          statusLabel =
            whseFrom && whseTo
              ? `Action Key: ${actionKey} · Stock Adj ${whseFrom} → ${whseTo}`
              : `Action Key: ${actionKey} · Stock Adj`;
          break;
        default: {
          const _exhaustive: never = action;
          void _exhaustive;
          statusLabel = `Action Key: ${actionKey}`;
          break;
        }
      }

      return [
        {
          id: `audit:${row.id}`,
          type: "sold" as const,
          typeLabel,
          timestamp: row.createdAt,
          serialNo,
          modelLabel: modelBySerial.get(serialNo) ?? "—",
          location: soldBranch ?? whseTo ?? restoredBranch,
          reference: transactionNo,
          referenceDetails: referenceDetails(
            isStockAdj ? "Stock Adj" : null,
            `Action Key: ${actionKey}`,
            transactionNo ? `Transaction ${transactionNo}` : null,
            whseFrom && whseTo
              ? route(whseFrom, whseTo)
              : soldBranch && restoredBranch && soldBranch !== restoredBranch
                ? route(soldBranch, restoredBranch)
                : soldBranch
                  ? `Branch: ${soldBranch}`
                  : null,
            toFollowCleanup ? "TO-FOLLOW cleanup" : null,
          ),
          status: statusLabel,
          performedBy: performedByLabel(row.user),
        },
      ];
    }),
  };
}

async function countedSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.StockCountLineWhereInput = {
    session: { tenantId },
    countedAt: dateFilter ? { not: null, ...dateFilter } : { not: null },
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { session: { sessionNo: textContains(q) } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.stockCountLine.findMany({
      where,
      orderBy: { countedAt: dir },
      take: window,
      select: {
        id: true,
        countedAt: true,
        status: true,
        expectedInCount: true,
        notes: true,
        branchInventory: { select: { statusCode: { select: { name: true } } } },
        session: {
          select: {
            sessionNo: true,
            status: true,
            branch: { select: { name: true } },
          },
        },
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        countedBy: userSelect,
      },
    }),
    prisma.stockCountLine.count({ where }),
  ]);
  return {
    count,
    events: rows.flatMap((r) => {
      if (!r.countedAt) return [];
      const serial = serialFields(r.serialNumber);
      if (!serial) return [];
      return [
        {
          id: `counted:${r.id}`,
          type: "counted" as const,
          timestamp: r.countedAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: r.session.branch.name,
          reference: r.session.sessionNo,
          referenceDetails: referenceDetails(
            `Session: ${STOCK_COUNT_SESSION_LABELS[r.session.status]}`,
            r.branchInventory
              ? `System status: ${r.branchInventory.statusCode.name}`
              : null,
            r.expectedInCount ? null : "Not expected in this count",
            r.notes ? `Note: ${r.notes}` : null,
          ),
          status: COUNT_LINE_STATUS_LABELS[r.status] ?? r.status,
          performedBy: performedByLabel(r.countedBy),
        },
      ];
    }),
  };
}

/**
 * For delivery ledger rows: the order behind each delivery and who approved it, keyed by
 * delivery number (the reference the ledger details carry).
 */
async function loadDeliveryOrderApprovals(
  tenantId: string,
  deliveryNos: (string | null)[],
): Promise<Map<string, string[]>> {
  const numbers = [...new Set(deliveryNos.filter((no): no is string => Boolean(no)))];
  if (numbers.length === 0) return new Map();

  const deliveries = await prisma.branchDelivery.findMany({
    where: { tenantId, deliveryNo: { in: numbers } },
    select: {
      deliveryNo: true,
      order: { select: { orderNumber: true, approvalLevels: approvalLevelSelect } },
    },
  });
  const approvers = await loadApprovers(
    tenantId,
    approverIds(deliveries.flatMap((delivery) => (delivery.order ? [delivery.order.approvalLevels] : []))),
  );
  return new Map(
    deliveries.flatMap((delivery) =>
      delivery.order
        ? [
            [
              delivery.deliveryNo,
              [
                `Order ${delivery.order.orderNumber}`,
                ...approvalReferenceLines(delivery.order.approvalLevels, approvers),
              ],
            ] as const,
          ]
        : [],
    ),
  );
}

/** Lines in time order; steps that have not happened drop out. */
function timedLines(steps: { at: Date | null; line: string | null }[]): string[] {
  return steps
    .filter((step): step is { at: Date; line: string } => Boolean(step.at && step.line))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((step) => step.line);
}

/** For sales return / replacement ledger rows: who moved the request through each step. */
async function loadReturnRequestApprovals(
  tenantId: string,
  requestIds: (string | null)[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(requestIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const requests = await prisma.branchReturnRequest.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true,
      createdAt: true,
      acceptedAt: true,
      evaluatedAt: true,
      approvedAt: true,
      requestNotes: true,
      evaluationNotes: true,
      requestedBy: userSelect,
      acceptedBy: userSelect,
      evaluatedBy: userSelect,
      approvedBy: userSelect,
    },
  });
  return new Map(
    requests.map((request) => [
      request.id,
      timedLines([
        {
          at: request.createdAt,
          line: decisionReferenceLine(
            "Requested",
            approverName(request.requestedBy),
            request.createdAt,
            request.requestNotes,
          ),
        },
        {
          at: request.acceptedAt,
          line: decisionReferenceLine("Accepted", approverName(request.acceptedBy), request.acceptedAt),
        },
        {
          at: request.evaluatedAt,
          line: decisionReferenceLine(
            "Evaluated",
            approverName(request.evaluatedBy),
            request.evaluatedAt,
            request.evaluationNotes,
          ),
        },
        {
          at: request.approvedAt,
          line: decisionReferenceLine("Approved", approverName(request.approvedBy), request.approvedAt),
        },
      ]),
    ]),
  );
}

interface DefectReportRef {
  reportedAt: Date;
  branchName: string;
  lines: string[];
}

/**
 * A defect ledger row is written in the same request that files or decides the report,
 * so a short allowance covers the gap between the two writes.
 */
const DEFECT_REPORT_MATCH_MS = 5_000;

/** Defect reports of the given serials, newest first, with who reported and decided each. */
async function loadDefectReports(
  tenantId: string,
  serialNumberIds: string[],
): Promise<Map<string, DefectReportRef[]>> {
  const ids = [...new Set(serialNumberIds)];
  if (ids.length === 0) return new Map();

  const reports = await prisma.branchDefectReport.findMany({
    where: { tenantId, serialNumberId: { in: ids } },
    orderBy: { reportedAt: "desc" },
    select: {
      serialNumberId: true,
      status: true,
      reason: true,
      reportedAt: true,
      decidedAt: true,
      decisionRemarks: true,
      branch: { select: { name: true } },
      reporter: userSelect,
      decider: userSelect,
    },
  });
  const bySerial = new Map<string, DefectReportRef[]>();
  for (const report of reports) {
    const ref: DefectReportRef = {
      reportedAt: report.reportedAt,
      branchName: report.branch.name,
      lines: timedLines([
        {
          at: report.reportedAt,
          line: decisionReferenceLine(
            "Reported",
            approverName(report.reporter),
            report.reportedAt,
            report.reason,
          ),
        },
        {
          at: report.decidedAt,
          line: decisionReferenceLine(
            report.status === "approved" ? "Approved" : "Rejected",
            approverName(report.decider),
            report.decidedAt,
            report.decisionRemarks,
          ),
        },
      ]),
    };
    bySerial.set(report.serialNumberId, [...(bySerial.get(report.serialNumberId) ?? []), ref]);
  }
  return bySerial;
}

function defectReportFor(
  reports: DefectReportRef[] | undefined,
  historyAt: Date,
): DefectReportRef | null {
  return (
    reports?.find(
      (report) => report.reportedAt.getTime() <= historyAt.getTime() + DEFECT_REPORT_MATCH_MS,
    ) ?? null
  );
}

/** Delivery-return ledger rows; `deliveryReturnSource` lists those returns from the request. */
const DELIVERY_RETURN_LEDGER_ROWS: Prisma.SerialNumberHistoryWhereInput = {
  txnType: "return",
  details: { startsWith: DELIVERY_RETURN_HISTORY_PREFIX },
};

/**
 * Ledger rows the live tables do not already list. Reference is the document
 * number inside `details`; reference details are the full details text plus the
 * approvals behind it (order, sales return request, defect report).
 * Transfer, sale, pull-out, count and delivery return stay on their live sources only.
 */
async function historyLedgerSource(
  tenantId: string,
  { window, q, dateFilter, dir }: SourceOptions,
  activityType?: SerialActivityType,
): Promise<SourceResult> {
  const txnTypes = historyTxnTypesForActivity(activityType);
  if (txnTypes.length === 0) {
    return { events: [], count: 0 };
  }

  const where: Prisma.SerialNumberHistoryWhereInput = {
    tenantId,
    txnType: { in: txnTypes },
    NOT: DELIVERY_RETURN_LEDGER_ROWS,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(q
      ? {
          OR: [
            { serialNumber: { serialNo: textContains(q) } },
            { details: textContains(q) },
          ],
        }
      : {}),
  };

  const [rows, count] = await Promise.all([
    prisma.serialNumberHistory.findMany({
      where,
      orderBy: { createdAt: dir },
      take: window,
      select: {
        id: true,
        serialNumberId: true,
        txnType: true,
        details: true,
        status: true,
        createdAt: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        createdBy: userSelect,
      },
    }),
    prisma.serialNumberHistory.count({ where }),
  ]);

  const [deliveryApprovals, returnApprovals, defectReports] = await Promise.all([
    loadDeliveryOrderApprovals(
      tenantId,
      rows.flatMap((row) =>
        row.txnType === "delivery" ? [documentReferenceFromHistoryDetails(row.details)] : [],
      ),
    ),
    loadReturnRequestApprovals(
      tenantId,
      rows.flatMap((row) =>
        row.txnType === "return" || row.txnType === "replacement"
          ? [returnRequestIdFromHistoryDetails(row.details)]
          : [],
      ),
    ),
    loadDefectReports(
      tenantId,
      rows.flatMap((row) => (row.txnType === "defect" ? [row.serialNumberId] : [])),
    ),
  ]);

  return {
    count,
    events: rows.flatMap((row) => {
      const serial = serialFields(row.serialNumber);
      const activity = historyActivityForTxn(row.txnType);
      if (!serial || !activity) return [];
      const details = row.details?.trim() || null;
      const reference = documentReferenceFromHistoryDetails(details);
      const requestId = returnRequestIdFromHistoryDetails(details);
      const defect =
        row.txnType === "defect"
          ? defectReportFor(defectReports.get(row.serialNumberId), row.createdAt)
          : null;
      const approvals =
        row.txnType === "delivery" && reference
          ? deliveryApprovals.get(reference) ?? []
          : requestId
            ? returnApprovals.get(requestId) ?? []
            : defect?.lines ?? [];
      return [
        {
          id: `history:${row.id}`,
          type: activity.type,
          ...(activity.typeLabel ? { typeLabel: activity.typeLabel } : {}),
          timestamp: row.createdAt,
          serialNo: serial.serialNo,
          modelLabel: serial.modelLabel,
          location: defect?.branchName ?? null,
          reference,
          referenceDetails: referenceDetails(details, ...approvals),
          status: row.status?.trim() || null,
          performedBy: performedByLabel(row.createdBy),
        },
      ];
    }),
  };
}

function emptyActivityCounts(): Record<SerialActivityType, number> {
  return Object.fromEntries(SERIAL_ACTIVITY_TYPES.map((type) => [type, 0])) as Record<
    SerialActivityType,
    number
  >;
}

async function historyCountsByActivity(
  tenantId: string,
): Promise<Record<SerialActivityType, number>> {
  const counts = emptyActivityCounts();
  const txnTypes = historyTxnTypesForActivity();
  if (txnTypes.length === 0) return counts;

  const groups = await prisma.serialNumberHistory.groupBy({
    by: ["txnType"],
    where: { tenantId, txnType: { in: txnTypes }, NOT: DELIVERY_RETURN_LEDGER_ROWS },
    _count: { id: true },
  });

  for (const group of groups) {
    const activity = historyActivityForTxn(group.txnType);
    if (!activity) continue;
    counts[activity.type] += group._count.id;
  }

  return counts;
}

type ActivitySource = (tenantId: string, options: SourceOptions) => Promise<SourceResult>;

/**
 * Live sources per event type. Official Sales ADD/DEL/WHSE_ADD/stock_adj audits are
 * `sold` with a typeLabel override; unit transfers and delivery returns are
 * `transferred`. History rows (added in `list`) fill movements these do not describe.
 */
const SOURCES: Record<SerialActivityType, ActivitySource[]> = {
  registered: [registeredSource],
  status: [statusSource],
  transferred: [transferredSource, unitTransferSource, deliveryReturnSource],
  sold: [soldSource, officialSalesAuditSource],
  pulled_out: [pulledOutSource],
  counted: [countedSource],
};

export const serialActivityRepository = {
  /**
   * Merged, chronological activity feed across every serial-number lifecycle
   * source. Each source is over-fetched to `skip + limit` so the merged, sorted
   * window fully covers the requested page; total is the sum of source counts.
   */
  async list(tenantId: string, params: ListParams = {}) {
    const { limit, page, skip } = resolvePagination({
      page: params.page,
      limit: params.limit,
    });
    const window = skip + limit;
    const q = params.q?.trim() || undefined;
    const dateFilter = buildDateFilter(params.dateFrom, params.dateTo);
    const dir: SerialActivitySortDir = params.sortDir === "asc" ? "asc" : "desc";
    const mul = dir === "asc" ? 1 : -1;

    const historySource: ActivitySource = (sourceTenantId, options) =>
      historyLedgerSource(sourceTenantId, options, params.type);

    const active = [
      ...(params.type == null ? Object.values(SOURCES).flat() : SOURCES[params.type]),
      historySource,
    ];

    const results = await Promise.all(
      active.map((source) => source(tenantId, { window, q, dateFilter, dir })),
    );

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const merged = results
      .flatMap((r) => r.events)
      .sort((a, b) => (a.timestamp.getTime() - b.timestamp.getTime()) * mul)
      .slice(skip, skip + limit);

    return toPaginatedResult(merged, total, page, limit);
  },

  /**
   * All-time activity counts by event type (unfiltered — matches list KPI strips).
   */
  async getKpis(tenantId: string) {
    const opts: SourceOptions = { window: 0, dir: "desc" };

    const [liveCounts, historyCounts] = await Promise.all([
      Promise.all(
        SERIAL_ACTIVITY_TYPES.map(async (type) => {
          const results = await Promise.all(SOURCES[type].map((source) => source(tenantId, opts)));
          return results.reduce((sum, r) => sum + r.count, 0);
        }),
      ),
      historyCountsByActivity(tenantId),
    ]);

    const statuses = SERIAL_ACTIVITY_TYPES.map((type, index) => ({
      code: type,
      name: SERIAL_ACTIVITY_LABELS[type],
      count: liveCounts[index] + historyCounts[type],
    }));

    return {
      totalEvents: statuses.reduce((sum, row) => sum + row.count, 0),
      statuses,
    };
  },
};
