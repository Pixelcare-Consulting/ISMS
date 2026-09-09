import { z } from "zod";
import { tool } from "ai";

import {
  formatHelpHitsForPrompt,
  searchHelpCorpus,
} from "@/features/ai/services/help-corpus.service";
import {
  DASHBOARD_KPI_KEYS,
  kpiKeyVisible,
  resolveDashboardCapabilities,
  type DashboardKpiKey,
} from "@/features/dashboard/constants/dashboard-permissions";
import { dashboardKpiValue } from "@/features/dashboard/lib/dashboard-kpi-value";
import {
  getDashboardAnalytics,
  getDashboardKpis,
  type DashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";

function kpiLabel(key: DashboardKpiKey): string {
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
      return "Allocation gaps";
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
    label: kpiLabel(key),
    value: dashboardKpiValue(key, kpis),
  }));
}

export function buildAiReadTools(session: AppSession) {
  const permissions = session.user.permissions;
  const caps = resolveDashboardCapabilities(permissions);
  const canReadDashboard = hasPermission(permissions, "dashboard.manage") || caps.hasOps;

  return {
    searchHelp: tool({
      description:
        "Search Help FAQs, workflow guides, page tutorials, and module guides. Use this when the answer is a how-to or policy of use.",
      inputSchema: z.object({
        query: z.string().min(2).max(200).describe("Search phrase from the user question"),
      }),
      execute: async ({ query }) => {
        const hits = searchHelpCorpus(query, 6);
        return {
          hits,
          formatted: formatHelpHitsForPrompt(hits),
        };
      },
    }),
    ...(canReadDashboard
      ? {
          getDashboardSnapshot: tool({
            description:
              "Read the signed-in user's Dashboard numbers (same access as the Dashboard page). Use only when they ask about today's counts or backlog.",
            inputSchema: z.object({
              reason: z
                .string()
                .max(120)
                .optional()
                .describe("Why this snapshot is needed"),
            }),
            execute: async () => {
              const fullAccess = resolveFullAccess(permissions);
              const tenantId = session.user.tenantId;
              const userId = session.user.id;

              const [kpis, analytics, sales] = await Promise.all([
                caps.hasOps
                  ? getDashboardKpis(tenantId, userId, fullAccess)
                  : Promise.resolve(null),
                caps.hasOps
                  ? getDashboardAnalytics(tenantId, userId, fullAccess)
                  : Promise.resolve(null),
                caps.showSalesSection
                  ? getDashboardSalesAnalytics(tenantId, userId, fullAccess)
                  : Promise.resolve(null),
              ]);

              return {
                kpis: kpis ? visibleKpiSummary(kpis, permissions) : [],
                thisMonth: analytics?.periodSnapshot ?? null,
                sales: sales
                  ? {
                      salesThisMonth: sales.kpis.salesThisMonth,
                      openAtr: sales.kpis.openAtr,
                      returnsInProgress: sales.kpis.returnsInProgress,
                    }
                  : null,
              };
            },
          }),
        }
      : {}),
  };
}
