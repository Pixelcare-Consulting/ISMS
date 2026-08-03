import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";
import type {
  SerialActivityEvent,
  SerialActivityType,
} from "@/features/serial-activity/constants/serial-activity-display";

interface ListParams {
  page?: number;
  limit?: number;
  type?: SerialActivityType;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface SourceResult {
  events: SerialActivityEvent[];
  count: number;
}

interface SourceOptions {
  window: number;
  q?: string;
  dateFilter?: Prisma.DateTimeFilter;
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

const userSelect = {
  select: { name: true, email: true },
} as const;

function performedByLabel(
  user: { name: string | null; email: string } | null,
): { name: string | null; email: string } | null {
  return user ? { name: user.name, email: user.email } : null;
}

/** Case-insensitive serial-number search fragment (or empty when no query). */
function serialContains(q?: string) {
  return q ? { contains: q, mode: "insensitive" as const } : undefined;
}

async function registeredSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.SerialNumberWhereInput = {
    tenantId,
    ...(q ? { serialNo: serialContains(q) } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.serialNumber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: window,
      select: {
        id: true,
        serialNo: true,
        createdAt: true,
        model: modelSelect,
        createdBy: userSelect,
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
      location: null,
      reference: null,
      status: null,
      amount: null,
      performedBy: performedByLabel(r.createdBy),
    })),
  };
}

async function statusSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchInventoryWhereInput = {
    tenantId,
    ...(q ? { serialNumber: { serialNo: serialContains(q) } } : {}),
    ...(dateFilter ? { updatedAt: dateFilter } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchInventory.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: window,
      select: {
        id: true,
        updatedAt: true,
        branch: { select: { name: true } },
        statusCode: { select: { name: true } },
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        updatedBy: userSelect,
      },
    }),
    prisma.branchInventory.count({ where }),
  ]);
  return {
    count,
    events: rows.map((r) => ({
      id: `status:${r.id}`,
      type: "status",
      timestamp: r.updatedAt,
      serialNo: r.serialNumber.serialNo,
      modelLabel: modelLabel(r.serialNumber.model),
      location: r.branch.name,
      reference: null,
      status: r.statusCode.name,
      amount: null,
      performedBy: performedByLabel(r.updatedBy),
    })),
  };
}

async function transferredSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchTransferLineWhereInput = {
    transfer: { tenantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    ...(q ? { serialNumber: { serialNo: serialContains(q) } } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchTransferLine.findMany({
      where,
      orderBy: { transfer: { createdAt: "desc" } },
      take: window,
      select: {
        id: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        transfer: {
          select: {
            transferNo: true,
            createdAt: true,
            fromBranch: { select: { name: true } },
            toBranch: { select: { name: true } },
            createdBy: userSelect,
          },
        },
      },
    }),
    prisma.branchTransferLine.count({ where }),
  ]);
  return {
    count,
    events: rows.map((r) => ({
      id: `transferred:${r.id}`,
      type: "transferred",
      timestamp: r.transfer.createdAt,
      serialNo: r.serialNumber.serialNo,
      modelLabel: modelLabel(r.serialNumber.model),
      location: `${r.transfer.fromBranch.name} → ${r.transfer.toBranch.name}`,
      reference: r.transfer.transferNo,
      status: null,
      amount: null,
      performedBy: performedByLabel(r.transfer.createdBy),
    })),
  };
}

async function soldSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchSalesTransactionDetailWhereInput = {
    sale: {
      tenantId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    ...(q ? { serialNumber: { serialNo: serialContains(q) } } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchSalesTransactionDetail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: window,
      select: {
        id: true,
        createdAt: true,
        saleAmount: true,
        amount: true,
        sale: {
          select: {
            transactionNo: true,
            amount: true,
            branch: { select: { name: true } },
            createdBy: userSelect,
          },
        },
        serialNumber: { select: { serialNo: true, model: modelSelect } },
      },
    }),
    prisma.branchSalesTransactionDetail.count({ where }),
  ]);
  return {
    count,
    events: rows.map((r) => ({
      id: `sold:${r.id}`,
      type: "sold" as const,
      timestamp: r.createdAt,
      serialNo: r.serialNumber.serialNo,
      modelLabel: modelLabel(r.serialNumber.model),
      location: r.sale.branch.name,
      reference: r.sale.transactionNo,
      status: null,
      amount: (r.saleAmount ?? r.amount ?? r.sale.amount).toString(),
      performedBy: performedByLabel(r.sale.createdBy),
    })),
  };
}

async function pulledOutSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.BranchPulloutLineWhereInput = {
    pullout: { tenantId, ...(dateFilter ? { createdAt: dateFilter } : {}) },
    ...(q ? { serialNumber: { serialNo: serialContains(q) } } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.branchPulloutLine.findMany({
      where,
      orderBy: { pullout: { createdAt: "desc" } },
      take: window,
      select: {
        id: true,
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        pullout: {
          select: {
            pulloutNo: true,
            createdAt: true,
            branch: { select: { name: true } },
            warehouse: { select: { name: true } },
            createdBy: userSelect,
          },
        },
      },
    }),
    prisma.branchPulloutLine.count({ where }),
  ]);
  return {
    count,
    events: rows.map((r) => ({
      id: `pulled_out:${r.id}`,
      type: "pulled_out",
      timestamp: r.pullout.createdAt,
      serialNo: r.serialNumber.serialNo,
      modelLabel: modelLabel(r.serialNumber.model),
      location: `${r.pullout.branch.name} → ${r.pullout.warehouse.name}`,
      reference: r.pullout.pulloutNo,
      status: null,
      amount: null,
      performedBy: performedByLabel(r.pullout.createdBy),
    })),
  };
}

async function countedSource(
  tenantId: string,
  { window, q, dateFilter }: SourceOptions,
): Promise<SourceResult> {
  const where: Prisma.StockCountLineWhereInput = {
    session: { tenantId },
    countedAt: dateFilter ? { not: null, ...dateFilter } : { not: null },
    ...(q ? { serialNumber: { serialNo: serialContains(q) } } : {}),
  };
  const [rows, count] = await Promise.all([
    prisma.stockCountLine.findMany({
      where,
      orderBy: { countedAt: "desc" },
      take: window,
      select: {
        id: true,
        countedAt: true,
        status: true,
        session: {
          select: { sessionNo: true, branch: { select: { name: true } } },
        },
        serialNumber: { select: { serialNo: true, model: modelSelect } },
        countedBy: userSelect,
      },
    }),
    prisma.stockCountLine.count({ where }),
  ]);
  return {
    count,
    events: rows.flatMap((r) =>
      r.countedAt
        ? [
            {
              id: `counted:${r.id}`,
              type: "counted" as const,
              timestamp: r.countedAt,
              serialNo: r.serialNumber.serialNo,
              modelLabel: modelLabel(r.serialNumber.model),
              location: r.session.branch.name,
              reference: r.session.sessionNo,
              status: r.status,
              amount: null,
              performedBy: performedByLabel(r.countedBy),
            },
          ]
        : [],
    ),
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

    const active = params.type
      ? [SOURCES[params.type]]
      : Object.values(SOURCES);

    const results = await Promise.all(
      active.map((source) => source(tenantId, { window, q, dateFilter })),
    );

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const merged = results
      .flatMap((r) => r.events)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(skip, skip + limit);

    return toPaginatedResult(merged, total, page, limit);
  },
};
