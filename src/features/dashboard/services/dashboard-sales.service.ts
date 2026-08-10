import type { AtrStatus, ReturnRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";
import { getUserBranchIds, branchScopeFilter } from "@/lib/aor/scope";
import { CACHE_TTL, cacheKey, getOrSet } from "@/lib/cache/redis";
import type { KpiStatusCount } from "@/lib/kpi-cards";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

const SALE_STATUS_CODES = ["SLD", "RSV", "OFS", "FW"] as const;

const SALE_STATUS_FALLBACK: Record<string, string> = {
  SLD: "Sold",
  RSV: "Reserved",
  OFS: "Official Sold",
  FW: "TO FOLLOW",
};

const ATR_PIPELINE_ORDER: AtrStatus[] = ["open", "reserve", "closed"];
const RETURN_PIPELINE_ORDER: ReturnRequestStatus[] = [
  "pending_cs",
  "pending_tl",
  "approved",
  "rejected",
  "completed",
];

const ATR_RETURN_LABELS: Record<string, string> = {
  open: "Open ATR",
  reserve: "Reserve",
  closed: "Closed",
  pending_cs: "Pending CS",
  pending_tl: "Pending TL",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

const RETURNS_IN_PROGRESS: ReturnRequestStatus[] = [
  "pending_cs",
  "pending_tl",
  "approved",
];

export interface DashboardSalesKpis {
  salesThisMonth: number;
  saleAmountThisMonth: number;
  openAtr: number;
  returnsInProgress: number;
}

export interface DashboardSalesRankingRow {
  id: string;
  name: string;
  value: number;
}

export interface DashboardSalesAnalytics {
  kpis: DashboardSalesKpis;
  saleStatusMix: KpiStatusCount[];
  atrReturnPipeline: KpiStatusCount[];
  topBranches: DashboardSalesRankingRow[];
  topModels: DashboardSalesRankingRow[];
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function emptyAnalytics(): DashboardSalesAnalytics {
  return {
    kpis: {
      salesThisMonth: 0,
      saleAmountThisMonth: 0,
      openAtr: 0,
      returnsInProgress: 0,
    },
    saleStatusMix: SALE_STATUS_CODES.map((code) => ({
      code,
      name: SALE_STATUS_FALLBACK[code] ?? code,
      count: 0,
    })),
    atrReturnPipeline: [
      ...ATR_PIPELINE_ORDER.map((code) => ({
        code,
        name: ATR_RETURN_LABELS[code] ?? code,
        count: 0,
      })),
      ...RETURN_PIPELINE_ORDER.map((code) => ({
        code,
        name: ATR_RETURN_LABELS[code] ?? code,
        count: 0,
      })),
    ],
    topBranches: [],
    topModels: [],
  };
}

async function computeDashboardSalesAnalytics(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardSalesAnalytics> {
  const branchIds = hasFullAccess ? null : await getUserBranchIds(tenantId, userId);
  if (!hasFullAccess && branchIds !== null && branchIds.length === 0) {
    return emptyAnalytics();
  }

  const scope = branchScopeFilter(branchIds);
  const monthStart = startOfCurrentMonth();
  const saleScope = { tenantId, ...scope };
  const monthSaleScope = { ...saleScope, createdAt: { gte: monthStart } };

  const inventoryCodes =
    await reasonStatusRepository.listActiveCodesByCategory(
      tenantId,
      "inventory_system",
    );
  const saleStatusCodeIds = inventoryCodes
    .filter((row) =>
      SALE_STATUS_CODES.some(
        (code) => row.code.toUpperCase() === code.toUpperCase(),
      ),
    )
    .map((row) => row.id);
  const codeById = new Map(
    inventoryCodes.map((row) => [row.id, row] as const),
  );

  const [
    salesThisMonth,
    openAtr,
    returnsInProgress,
    saleAmountWithSaleAmount,
    saleAmountFallback,
    statusGroups,
    atrGroups,
    returnGroups,
    branchGroups,
    modelGroups,
  ] = await Promise.all([
    prisma.branchSalesTransaction.count({ where: monthSaleScope }),
    prisma.branchSalesTransaction.count({
      where: { ...saleScope, atrStatus: "open" },
    }),
    prisma.branchReturnRequest.count({
      where: {
        tenantId,
        status: { in: RETURNS_IN_PROGRESS },
        sale: { ...scope },
      },
    }),
    prisma.branchSalesTransactionDetail.aggregate({
      where: {
        sale: monthSaleScope,
        saleAmount: { not: null },
      },
      _sum: { saleAmount: true },
    }),
    prisma.branchSalesTransactionDetail.aggregate({
      where: {
        sale: monthSaleScope,
        saleAmount: null,
        amount: { not: null },
      },
      _sum: { amount: true },
    }),
    saleStatusCodeIds.length > 0
      ? prisma.branchSalesTransactionDetail.groupBy({
          by: ["statusCodeId"],
          where: {
            sale: saleScope,
            statusCodeId: { in: saleStatusCodeIds },
          },
          _count: { id: true },
        })
      : Promise.resolve([]),
    prisma.branchSalesTransaction.groupBy({
      by: ["atrStatus"],
      where: saleScope,
      _count: { id: true },
    }),
    prisma.branchReturnRequest.groupBy({
      by: ["status"],
      where: {
        tenantId,
        sale: { ...scope },
      },
      _count: { id: true },
    }),
    prisma.branchSalesTransaction.groupBy({
      by: ["branchId"],
      where: monthSaleScope,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    prisma.branchSalesTransactionDetail.groupBy({
      by: ["modelId"],
      where: {
        sale: monthSaleScope,
        modelId: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);

  const saleAmountThisMonth =
    decimalToNumber(saleAmountWithSaleAmount._sum.saleAmount) +
    decimalToNumber(saleAmountFallback._sum.amount);

  const statusCountByCode = new Map<string, number>();
  for (const group of statusGroups) {
    if (!group.statusCodeId) continue;
    const code = codeById.get(group.statusCodeId)?.code?.toUpperCase();
    if (!code) continue;
    statusCountByCode.set(
      code,
      (statusCountByCode.get(code) ?? 0) + group._count.id,
    );
  }

  const saleStatusMix: KpiStatusCount[] = SALE_STATUS_CODES.map((code) => {
    const meta = inventoryCodes.find(
      (row) => row.code.toUpperCase() === code,
    );
    return {
      code,
      name: meta?.name ?? SALE_STATUS_FALLBACK[code] ?? code,
      count: statusCountByCode.get(code) ?? 0,
    };
  });

  const atrCount = new Map(
    atrGroups.map((g) => [g.atrStatus, g._count.id] as const),
  );
  const returnCount = new Map(
    returnGroups.map((g) => [g.status, g._count.id] as const),
  );

  const atrReturnPipeline: KpiStatusCount[] = [
    ...ATR_PIPELINE_ORDER.map((code) => ({
      code,
      name: ATR_RETURN_LABELS[code] ?? code,
      count: atrCount.get(code) ?? 0,
    })),
    ...RETURN_PIPELINE_ORDER.map((code) => ({
      code,
      name: ATR_RETURN_LABELS[code] ?? code,
      count: returnCount.get(code) ?? 0,
    })),
  ];

  const branchIdsForNames = branchGroups.map((g) => g.branchId);
  const modelIdsForNames = modelGroups
    .map((g) => g.modelId)
    .filter((id): id is string => Boolean(id));

  const [branches, models] = await Promise.all([
    branchIdsForNames.length > 0
      ? prisma.branch.findMany({
          where: { id: { in: branchIdsForNames } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    modelIdsForNames.length > 0
      ? prisma.productModel.findMany({
          where: { id: { in: modelIdsForNames } },
          select: { id: true, name: true, skuCode: true },
        })
      : Promise.resolve([]),
  ]);

  const branchNameById = new Map(branches.map((b) => [b.id, b.name] as const));
  const modelLabelById = new Map(
    models.map(
      (m) => [m.id, m.skuCode ? `${m.skuCode} · ${m.name}` : m.name] as const,
    ),
  );

  const topBranches: DashboardSalesRankingRow[] = branchGroups.map((g) => ({
    id: g.branchId,
    name: branchNameById.get(g.branchId) ?? "Unknown branch",
    value: decimalToNumber(g._sum.amount),
  }));

  const topModels: DashboardSalesRankingRow[] = modelGroups
    .filter((g): g is typeof g & { modelId: string } => Boolean(g.modelId))
    .map((g) => ({
      id: g.modelId,
      name: modelLabelById.get(g.modelId) ?? "Unknown model",
      value: g._count.id,
    }));

  return {
    kpis: {
      salesThisMonth,
      saleAmountThisMonth,
      openAtr,
      returnsInProgress,
    },
    saleStatusMix,
    atrReturnPipeline,
    topBranches,
    topModels,
  };
}

export async function getDashboardSalesAnalytics(
  tenantId: string,
  userId: string,
  hasFullAccess: boolean,
): Promise<DashboardSalesAnalytics> {
  const scopeKey = hasFullAccess ? "full" : userId;
  return getOrSet(
    cacheKey("tenant", tenantId, "dashboard-sales-analytics-v1", scopeKey),
    CACHE_TTL.dashboardKpis,
    () => computeDashboardSalesAnalytics(tenantId, userId, hasFullAccess),
  );
}
