import { tool } from "ai";
import { z } from "zod";

import {
  DASHBOARD_KPI_KEYS,
  kpiKeyVisible,
  resolveDashboardCapabilities,
  type DashboardKpiKey,
} from "@/features/dashboard/constants/dashboard-permissions";
import {
  dashboardKpiValue,
  dashboardPlanningAlertLabel,
} from "@/features/dashboard/lib/dashboard-kpi-value";
import {
  getDashboardAnalytics,
  getDashboardKpis,
  type DashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { canViewDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { DEMAND_PLANNING_RUNS_PATH } from "@/features/demand-planning/lib/paths";
import {
  coverageService,
  DEMAND_PLANNING_COVERAGE_PERMISSIONS,
} from "@/features/demand-planning/services/coverage.service";
import { demandPlanningRunService } from "@/features/demand-planning/services/demand-planning-run.service";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import { suggestedOrderService } from "@/features/forecast/services/suggested-order.service";
import { canAccessLogistics } from "@/features/logistics/constants/logistics-permissions";
import { logisticsRepository } from "@/features/logistics/repositories/logistics.repository";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { planogramService } from "@/features/planogram/services/planogram.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { PIXELCARE_AI_LIMITS } from "@/features/pixelcare-ai/constants/limits";
import { isPixelcareAiSampleMode } from "@/features/pixelcare-ai/constants/permissions";
import {
  isUnrestrictedBranchAccess,
  listPermittedBranches,
} from "@/features/pixelcare-ai/tools/branch-access";
import {
  SAMPLE_ALLOCATION_GAPS,
  SAMPLE_BRANCH_QUOTAS,
  SAMPLE_COVERAGE_MONITOR,
  SAMPLE_DASHBOARD_SNAPSHOT,
  SAMPLE_DEMAND_PLANNING_RUN,
  SAMPLE_DEMAND_PLANNING_RUNS,
  SAMPLE_DRAFT_SUGGESTED_ORDERS,
  SAMPLE_LOGISTICS_KPIS,
  SAMPLE_PLANOGRAM_ALERTS,
  SAMPLE_RETURN_STATUS,
} from "@/features/pixelcare-ai/tools/sample-fixtures";
import {
  retrievedAt,
  truncatePayload,
} from "@/features/pixelcare-ai/tools/tool-payload";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";

function kpiLabel(key: DashboardKpiKey, kpis: DashboardKpis): string {
  switch (key) {
    case "pendingOrderApprovals":
      return "Orders waiting for review";
    case "deliveryInTransit":
      return "Deliveries in transit";
    case "stockCount":
      return "Units on hand";
    case "openAtr":
      return "Open returns";
    case "belowPlanogramCapacity":
      return "Branches below shelf max";
    case "milBreaches":
      return "MIL alerts";
    case "allocationGaps":
      return dashboardPlanningAlertLabel(kpis);
    case "draftSuggestedOrders":
      return "Draft suggested orders";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function resolveFullAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

function visibleKpiSummary(kpis: DashboardKpis, permissions: string[] | undefined) {
  const caps = resolveDashboardCapabilities(permissions);
  return DASHBOARD_KPI_KEYS.filter((key) => kpiKeyVisible(key, caps)).map((key) => ({
    label: kpiLabel(key, kpis),
    value: dashboardKpiValue(key, kpis),
  }));
}

function canViewCoverage(permissions: string[] | undefined): boolean {
  return DEMAND_PLANNING_COVERAGE_PERMISSIONS.some((slug) =>
    hasPermission(permissions, slug),
  );
}

function canManageForecastOrPlanogram(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "forecast.manage") ||
    hasPermission(permissions, "planogram.manage")
  );
}

function canReadBranchQuotas(permissions: string[] | undefined): boolean {
  return (
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "inventory.view") ||
    hasAnyOrderPermission(permissions, "view")
  );
}

async function buildLogisticsKpiBlock(
  tenantId: string,
  category: "delivery_workflow" | "transfer_workflow" | "pullout_workflow",
  countByStatus: () => Promise<{ statusCodeId: string; _count: { id: number } }[]>,
  countAll: () => Promise<number>,
) {
  const codes = await reasonStatusService.listActiveCodes(tenantId, category);
  const [statusGroups, total] = await Promise.all([countByStatus(), countAll()]);
  const countByCodeId = new Map(statusGroups.map((g) => [g.statusCodeId, g._count.id]));
  return {
    total,
    statuses: codes.map((c) => ({
      code: c.code,
      name: c.name,
      count: countByCodeId.get(c.id) ?? 0,
    })),
  };
}

/**
 * Wave 1 read-only planning / ops tools for Pixelcare AI.
 * Reuses existing ISMS services; no writes or invented formulas.
 */
export function buildPlanningOpsTools(session: AppSession) {
  const sampleMode = isPixelcareAiSampleMode();
  const permissions = session.user.permissions;
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const canForecastView = canViewDemandPlanning(permissions);
  const canCoverage = canViewCoverage(permissions);
  const canForecastManage = canManageForecastOrPlanogram(permissions);
  const canQuotas = canReadBranchQuotas(permissions);
  const canPlanogram =
    hasPermission(permissions, "planogram.view") ||
    hasPermission(permissions, "planogram.manage");
  const canReturns =
    hasPermission(permissions, "returns.view") ||
    hasPermission(permissions, "returns.branch.view") ||
    hasPermission(permissions, "returns.service.view") ||
    hasPermission(permissions, "sales.return.view");
  const canLogistics = canAccessLogistics(permissions);
  const dashCaps = resolveDashboardCapabilities(permissions);
  const canDashboard =
    hasPermission(permissions, "dashboard.manage") || dashCaps.hasOps;

  return {
    getDashboardSnapshot: tool({
      description:
        "Read the signed-in user's Dashboard numbers (same access as the Dashboard page). Use for today's ops counts, backlog, or sales snapshot.",
      inputSchema: z.object({
        reason: z
          .string()
          .max(120)
          .optional()
          .describe("Why this snapshot is needed"),
      }),
      execute: async () => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_DASHBOARD_SNAPSHOT);
        }
        if (!canDashboard) {
          return { error: "You do not have Dashboard access." };
        }

        const fullAccess = resolveFullAccess(permissions);
        const [kpis, analytics, sales] = await Promise.all([
          dashCaps.hasOps
            ? getDashboardKpis(tenantId, userId, fullAccess)
            : Promise.resolve(null),
          dashCaps.hasOps
            ? getDashboardAnalytics(tenantId, userId, fullAccess)
            : Promise.resolve(null),
          dashCaps.showSalesSection
            ? getDashboardSalesAnalytics(tenantId, userId, fullAccess)
            : Promise.resolve(null),
        ]);

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/dashboard",
          kpis: kpis ? visibleKpiSummary(kpis, permissions) : [],
          thisMonth: analytics?.periodSnapshot ?? null,
          sales: sales
            ? {
                salesThisMonth: sales.kpis.salesThisMonth,
                openAtr: sales.kpis.openAtr,
                returnsInProgress: sales.kpis.returnsInProgress,
              }
            : null,
          nextSteps: [{ label: "Open Dashboard", href: "/dashboard" }],
        });
      },
    }),

    listDemandPlanningRuns: tool({
      description:
        "List recent Supply / Demand Planning runs the user can view. Use when they ask about planning runs, forecasts, or linkage to a period.",
      inputSchema: z.object({
        periodId: z.string().optional().describe("Optional planning period id filter"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ periodId, limit }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_DEMAND_PLANNING_RUNS);
        }
        if (!canForecastView) {
          return {
            error:
              "Demand planning is outside your access. Ask an admin for forecast.view or forecast.manage.",
          };
        }

        const pageLimit = Math.min(
          limit ?? PIXELCARE_AI_LIMITS.maxToolResultItems,
          PIXELCARE_AI_LIMITS.maxToolResultItems,
        );
        const result = await demandPlanningRunService.listRuns(
          tenantId,
          { page: 1, limit: pageLimit },
          { periodId: periodId?.trim() || undefined },
        );

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: DEMAND_PLANNING_RUNS_PATH,
          total: result.total,
          returned: result.items.length,
          runs: result.items.map((run) => ({
            id: run.id,
            documentNumber: run.documentNumber,
            version: run.version,
            status: run.status,
            name: run.name,
            periodLabel: run.periodLabel,
            branchCount: run.branchCount,
            plannedBranchCount: run.plannedBranchCount,
            createdAt: run.createdAt,
            releasedAt: run.releasedAt,
          })),
          nextSteps: [
            { label: "Open Supply Planning runs", href: DEMAND_PLANNING_RUNS_PATH },
            {
              label: "Open coverage monitor",
              href: "/reports/demand-planning",
            },
          ],
        });
      },
    }),

    getDemandPlanningRun: tool({
      description:
        "Get one Supply / Demand Planning run by id (period label, status, branch counts). Does not invent forecast math.",
      inputSchema: z.object({
        runId: z.string().min(1).describe("Demand planning run id"),
      }),
      execute: async ({ runId }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_DEMAND_PLANNING_RUN);
        }
        if (!canForecastView) {
          return {
            error:
              "Demand planning is outside your access. Ask an admin for forecast.view or forecast.manage.",
          };
        }

        const run = await demandPlanningRunService.getRun(tenantId, runId.trim());
        if (!run) {
          return { error: "Supply planning run not found." };
        }

        const permittedIds = isUnrestrictedBranchAccess(permissions)
          ? null
          : new Set((await listPermittedBranches(session)).map((branch) => branch.id));
        const visibleBranches = (run.branches ?? []).filter((branch) =>
          permittedIds === null ? true : permittedIds.has(branch.branchId),
        );
        const branchSummary = visibleBranches
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
          .map((branch) => ({
            id: branch.id,
            branchId: branch.branchId,
            sapCode: branch.sapCode,
            name: branch.name,
            planStatus: branch.planStatus,
          }));

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: `${DEMAND_PLANNING_RUNS_PATH}?run=${run.id}`,
          run: {
            id: run.id,
            documentNumber: run.documentNumber,
            version: run.version,
            status: run.status,
            name: run.name,
            periodId: run.periodId,
            periodLabel: run.periodLabel,
            createdAt: run.createdAt,
            releasedAt: run.releasedAt,
            branchCount: visibleBranches.length,
          },
          branches: branchSummary,
          note:
            visibleBranches.length > branchSummary.length
              ? `Showing first ${branchSummary.length} of ${visibleBranches.length} branches in your area.`
              : undefined,
          nextSteps: [
            {
              label: "Open this planning run",
              href: `${DEMAND_PLANNING_RUNS_PATH}?run=${run.id}`,
            },
          ],
        });
      },
    }),

    getCoverageMonitor: tool({
      description:
        "Read Demand Planning coverage monitor KPIs and a capped branch list for a period (active period if omitted).",
      inputSchema: z.object({
        periodId: z
          .string()
          .optional()
          .describe("Planning period id; defaults to active period"),
      }),
      execute: async ({ periodId }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_COVERAGE_MONITOR);
        }
        if (!canCoverage) {
          return {
            error:
              "Coverage monitor is outside your access (needs forecast.view, forecast.manage, or reports.view).",
          };
        }

        const view = await coverageService.getCoverageMonitor(
          tenantId,
          periodId?.trim() || undefined,
        );
        const permittedIds = isUnrestrictedBranchAccess(permissions)
          ? null
          : new Set((await listPermittedBranches(session)).map((branch) => branch.id));
        const branches = view.branches
          .filter((row) => (permittedIds === null ? true : permittedIds.has(row.branchId)))
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems)
          .map((row) => ({
            branchId: row.branchId,
            sapCode: row.sapCode,
            name: row.name,
            planStatus: row.planStatus,
            allocQty: row.allocQty,
            drop1Qty: row.drop1Qty,
            milDays: row.milDays,
            allocationDays: row.allocationDays,
            targetDays: row.targetDays,
          }));

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/reports/demand-planning",
          selectedPeriodId: view.selectedPeriodId,
          periodLabel: view.periodLabel,
          isActivePeriod: view.isActivePeriod,
          run: view.run,
          kpis: view.kpis,
          coverage: view.coverage,
          branches,
          note:
            view.branches.filter((row) =>
              permittedIds === null ? true : permittedIds.has(row.branchId),
            ).length > branches.length
              ? `Showing first ${branches.length} branches in your area.`
              : view.run
                ? undefined
                : "No coverage run for this period yet.",
          nextSteps: [
            { label: "Open coverage monitor", href: "/reports/demand-planning" },
            { label: "Open Supply Planning runs", href: DEMAND_PLANNING_RUNS_PATH },
          ],
        });
      },
    }),

    listAllocationGaps: tool({
      description:
        "List computed allocation / shelf gaps for a planning period (Shelf max vs stock). Uses existing allocation rows — does not run allocation.",
      inputSchema: z.object({
        periodId: z
          .string()
          .optional()
          .describe("Planning period id; defaults to active period"),
        branchId: z.string().optional(),
        q: z.string().max(80).optional().describe("SKU or branch name filter"),
      }),
      execute: async ({ periodId, branchId, q }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_ALLOCATION_GAPS);
        }
        if (!canForecastManage) {
          return {
            error:
              "Allocation gaps are outside your access (needs forecast.manage or planogram.manage).",
          };
        }

        const period =
          periodId?.trim()
            ? await forecastRepository.findPeriodById(tenantId, periodId.trim())
            : await forecastRepository.findActivePeriod(tenantId);
        if (!period) {
          return {
            error: "No planning period found. Open Settings → Planning to set an active period.",
            sourceHref: "/settings/planning",
          };
        }

        const result = await forecastRepository.listAllocationsForPeriodPaginated(
          tenantId,
          period.id,
          { page: 1, limit: PIXELCARE_AI_LIMITS.maxToolResultItems },
          { branchId: branchId?.trim() || undefined, q: q?.trim() || undefined },
        );

        const permittedIds = isUnrestrictedBranchAccess(permissions)
          ? null
          : new Set((await listPermittedBranches(session)).map((branch) => branch.id));
        const gaps = result.items
          .filter((row) => (permittedIds === null ? true : permittedIds.has(row.branch.id)))
          .map((row) => ({
            branchId: row.branch.id,
            branchName: row.branch.name,
            sapCode: row.branch.sapCode,
            skuCode: row.model.skuCode,
            name: row.model.name,
            shelfMax: row.planogramMax,
            currentStock: row.currentStock,
            gapQty: row.gapQty,
          }));

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/settings/planning",
          periodId: period.id,
          periodLabel: period.label,
          total: gaps.length,
          gaps,
          note: "Shelf max is planogram capacity already stored on the allocation row. SUG for order create remains Shelf max − STK on Order Analytics.",
          nextSteps: [
            { label: "Open Planning", href: "/settings/planning" },
            {
              label: "Open draft suggested orders",
              href: "/settings/planning",
            },
          ],
        });
      },
    }),

    listDraftSuggestedOrders: tool({
      description:
        "List draft suggested replenishment orders from planning (read-only). Does not generate or submit orders.",
      inputSchema: z.object({
        branchId: z.string().optional(),
        q: z.string().max(80).optional().describe("Order number or branch filter"),
      }),
      execute: async ({ branchId, q }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_DRAFT_SUGGESTED_ORDERS);
        }
        if (!canForecastManage) {
          return {
            error:
              "Draft suggested orders are outside your access (needs forecast.manage or planogram.manage).",
          };
        }

        const result = await suggestedOrderService.listDraftSuggestedOrdersPaginated(
          tenantId,
          { page: 1, limit: PIXELCARE_AI_LIMITS.maxToolResultItems },
          { branchId: branchId?.trim() || undefined, q: q?.trim() || undefined },
        );

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/settings/planning",
          total: result.total,
          orders: result.items.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            branchId: order.branch.id,
            branchName: order.branch.name,
            sapCode: order.branch.sapCode,
            lineCount: order.details.length,
            createdAt: order.createdAt.toISOString(),
          })),
          nextSteps: [
            { label: "Open Planning / drafts", href: "/settings/planning" },
            {
              label: "Open Auto-replenish orders",
              href: "/orders/auto-replenish",
            },
          ],
        });
      },
    }),

    listBranchQuotas: tool({
      description:
        "List branch quotas (branch / brand / month). AOR-scoped for non-admin users; does not invent quota math.",
      inputSchema: z.object({
        branchId: z.string().optional(),
        month: z
          .string()
          .optional()
          .describe("Optional YYYY-MM filter"),
      }),
      execute: async ({ branchId, month }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_BRANCH_QUOTAS);
        }
        if (!canQuotas) {
          return {
            error:
              "Branch quotas are outside your access (needs branches.manage, inventory.view, or order view).",
          };
        }

        let rows = await branchQuotaService.list(tenantId);
        const manageAll = hasPermission(permissions, "branches.manage");
        if (!manageAll) {
          const permitted = await listPermittedBranches(session);
          const allowed = new Set(permitted.map((b) => b.id));
          rows = rows.filter((row) => allowed.has(row.branchId));
        }

        const branchFilter = branchId?.trim();
        if (branchFilter) {
          rows = rows.filter(
            (row) =>
              row.branchId === branchFilter ||
              row.branch.sapCode.toLowerCase() === branchFilter.toLowerCase(),
          );
        }

        const monthFilter = month?.trim();
        if (monthFilter) {
          rows = rows.filter((row) => {
            const d = row.quotaDate;
            const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            return label === monthFilter || d.toISOString().startsWith(monthFilter);
          });
        }

        const capped = rows.slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems);

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/settings/branch-quotas",
          total: rows.length,
          returned: capped.length,
          quotas: capped.map((row) => ({
            id: row.id,
            branchId: row.branch.id,
            branchName: row.branch.name,
            sapCode: row.branch.sapCode,
            brandId: row.brand.id,
            brandName: row.brand.name,
            month: `${row.quotaDate.getUTCFullYear()}-${String(row.quotaDate.getUTCMonth() + 1).padStart(2, "0")}`,
            quotaAmount: Number(row.quotaAmount),
          })),
          note:
            rows.length > capped.length
              ? `Showing first ${capped.length} of ${rows.length}. Narrow with branchId or month.`
              : undefined,
          nextSteps: [
            { label: "Open Branch quotas", href: "/settings/branch-quotas" },
          ],
        });
      },
    }),

    getPlanogramAlerts: tool({
      description:
        "Read MIL and below Shelf max (capacity) alert counts by branch for the user's AOR. Say Shelf max — never maxQty.",
      inputSchema: z.object({
        reason: z.string().max(120).optional(),
      }),
      execute: async () => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_PLANOGRAM_ALERTS);
        }
        if (!canPlanogram) {
          return {
            error:
              "Planogram alerts are outside your access (needs planogram.view or planogram.manage).",
          };
        }

        const unrestricted = isUnrestrictedBranchAccess(permissions);
        const branchIds = unrestricted
          ? null
          : ((await getUserBranchIds(tenantId, userId)) ?? []);
        const details = await planogramService.getMilAndCapacityAlertDetails(
          tenantId,
          branchIds,
        );

        const permitted = await listPermittedBranches(session);
        const nameById = new Map(permitted.map((b) => [b.id, b.name]));

        const belowCapacityBranches = [...details.belowCapacityByBranch.entries()]
          .map(([id, count]) => ({
            branchId: id,
            branchName: nameById.get(id) ?? id,
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems);

        const milBreachBranches = [...details.milBreachesByBranch.entries()]
          .map(([id, count]) => ({
            branchId: id,
            branchName: nameById.get(id) ?? id,
            count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, PIXELCARE_AI_LIMITS.maxToolResultItems);

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/settings/planogram",
          belowCapacity: details.belowCapacity,
          milBreaches: details.milBreaches,
          belowCapacityBranches,
          milBreachBranches,
          note: "belowCapacity counts SKU-branch rows where on-hand is under Shelf max (planogram capacity).",
          nextSteps: [
            { label: "Open Planogram", href: "/settings/planogram" },
            { label: "Open Dashboard", href: "/dashboard" },
          ],
        });
      },
    }),

    findReturnStatus: tool({
      description:
        "Find live return / ATR status by ATR #, dealer RS #, transaction no, or return id (partial match). Bounded to the user's access.",
      inputSchema: z.object({
        query: z
          .string()
          .min(2)
          .max(80)
          .describe("ATR / RS / transaction / return id fragment"),
      }),
      execute: async ({ query }) => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_RETURN_STATUS);
        }
        if (!canReturns) {
          return {
            error:
              "Returns are outside your access. Ask an admin for returns permissions.",
            sourceHref: "/returns",
          };
        }

        const needle = query.trim();
        const unrestricted =
          hasPermission(permissions, "branches.manage") ||
          hasPermission(permissions, "returns.manage");
        const branchIds = unrestricted
          ? null
          : await getUserBranchIds(tenantId, userId);

        const returns = await prisma.branchReturnRequest.findMany({
          where: {
            tenantId,
            ...(branchIds && branchIds.length > 0
              ? { sale: { branchId: { in: branchIds } } }
              : {}),
            ...(branchIds && branchIds.length === 0
              ? { sale: { branchId: { in: [] as string[] } } }
              : {}),
            OR: [
              { id: { contains: needle, mode: "insensitive" } },
              { dealerRsNo: { contains: needle, mode: "insensitive" } },
              {
                sale: {
                  transactionNo: { contains: needle, mode: "insensitive" },
                },
              },
            ],
          },
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            status: true,
            actionType: true,
            dealerRsNo: true,
            createdAt: true,
            updatedAt: true,
            sale: {
              select: {
                id: true,
                transactionNo: true,
                atrStatus: true,
                branch: { select: { id: true, name: true, sapCode: true } },
              },
            },
          },
        });

        if (returns.length === 0) {
          return {
            retrievedAt: retrievedAt(),
            returns: [],
            note: "No matching returns in your access scope.",
            sourceHref: "/returns",
          };
        }

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/returns",
          returns: returns.map((row) => ({
            id: row.id,
            status: row.status,
            actionType: row.actionType,
            dealerRsNo: row.dealerRsNo,
            transactionNo: row.sale.transactionNo,
            atrStatus: row.sale.atrStatus,
            branchId: row.sale.branch.id,
            branchName: row.sale.branch.name,
            sapCode: row.sale.branch.sapCode,
            href: `/returns?focus=${row.id}`,
            updatedAt: row.updatedAt.toISOString(),
          })),
          nextSteps: [{ label: "Open Returns", href: "/returns" }],
        });
      },
    }),

    getLogisticsKpis: tool({
      description:
        "Read logistics KPI totals and status breakdowns for deliveries, transfers, and pull-outs (same builders as Logistics pages).",
      inputSchema: z.object({
        reason: z.string().max(120).optional(),
      }),
      execute: async () => {
        if (sampleMode) {
          return truncatePayload(SAMPLE_LOGISTICS_KPIS);
        }
        if (!canLogistics) {
          return {
            error: "Logistics is outside your access (needs logistics.view or related).",
          };
        }

        const [deliveries, transfers, pullouts] = await Promise.all([
          buildLogisticsKpiBlock(
            tenantId,
            "delivery_workflow",
            () => logisticsRepository.countDeliveriesByStatus(tenantId),
            () => logisticsRepository.countAllDeliveries(tenantId),
          ),
          buildLogisticsKpiBlock(
            tenantId,
            "transfer_workflow",
            () => logisticsRepository.countTransfersByStatus(tenantId),
            () => logisticsRepository.countAllTransfers(tenantId),
          ),
          buildLogisticsKpiBlock(
            tenantId,
            "pullout_workflow",
            () => logisticsRepository.countPulloutsByStatus(tenantId),
            () => logisticsRepository.countAllPullouts(tenantId),
          ),
        ]);

        return truncatePayload({
          sample: false,
          retrievedAt: retrievedAt(),
          sourceHref: "/logistics/deliveries",
          deliveries,
          transfers,
          pullouts,
          nextSteps: [
            { label: "Open Deliveries", href: "/logistics/deliveries" },
            { label: "Open Transfers", href: "/logistics/transfers" },
            { label: "Open Pull-outs", href: "/logistics/pickups" },
          ],
        });
      },
    }),
  };
}
