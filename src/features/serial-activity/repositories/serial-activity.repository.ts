import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import { STOCK_COUNT_SESSION_LABELS } from "@/features/stock-audit/constants/stock-count-workflow";
import { formatPeso } from "@/utils/format-currency";
import type {
  SerialActivityEvent,
  SerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";

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
        branch: { select: { name: true, sapCode: true } },
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
          reference: r.branch.sapCode,
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
          },
        },
      },
    }),
    prisma.branchTransferLine.count({ where }),
  ]);
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
          },
        },
      },
    }),
    prisma.branchPulloutLine.count({ where }),
  ]);
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
          ),
          status: `Pullout: ${r.pullout.statusCode.name}`,
          performedBy: performedByLabel(r.pullout.createdBy),
        },
      ];
    }),
  };
}

const OFFICIAL_SALES_AUDIT_ACTIONS = [
  "official_sales.add",
  "official_sales.del",
  "official_sales.whse_add",
] as const;

const OFFICIAL_SALES_ACTION_KEY_LABEL: Record<
  (typeof OFFICIAL_SALES_AUDIT_ACTIONS)[number],
  "ADD" | "DEL" | "WHSE_ADD"
> = {
  "official_sales.add": "ADD",
  "official_sales.del": "DEL",
  "official_sales.whse_add": "WHSE_ADD",
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
  return OFFICIAL_SALES_ACTION_KEY_LABEL[action];
}

/**
 * Append-only Official Sales ADD/DEL/WHSE_ADD trail from AuditLog so cycles
 * remain visible after sale details are hard-deleted.
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
      const typeLabel = `Official Sales ${actionKey}`;

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
          location: soldBranch ?? restoredBranch,
          reference: transactionNo,
          referenceDetails: referenceDetails(
            `Action Key: ${actionKey}`,
            transactionNo ? `Transaction ${transactionNo}` : null,
            soldBranch && restoredBranch && soldBranch !== restoredBranch
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

const SOURCES: Record<
  SerialActivityType,
  (tenantId: string, options: SourceOptions) => Promise<SourceResult>
> = {
  registered: registeredSource,
  status: statusSource,
  transferred: transferredSource,
  sold: soldSource,
  pulled_out: pulledOutSource,
  counted: countedSource,
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

    // Official Sales ADD/DEL audits use type `sold` with a typeLabel override so
    // they appear in the full feed and when filtering Sales transactions.
    const active =
      params.type == null
        ? [...Object.values(SOURCES), officialSalesAuditSource]
        : params.type === "sold"
          ? [SOURCES.sold, officialSalesAuditSource]
          : [SOURCES[params.type]];

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
};
