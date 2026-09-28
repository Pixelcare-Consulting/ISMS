import { generateText, Output } from "ai";

import { logAiAction } from "@/features/ai/lib/audit";
import { getAiModel } from "@/features/ai/lib/provider";
import { buildBriefingSystemPrompt } from "@/features/ai/lib/system-prompt";
import {
  dashboardBriefingSchema,
  type DashboardBriefing,
} from "@/features/ai/schemas/ai.schema";
import {
  DASHBOARD_KPI_KEYS,
  kpiKeyVisible,
  resolveDashboardCapabilities,
  resolveDashboardPersona,
  type DashboardKpiKey,
} from "@/features/dashboard/constants/dashboard-permissions";
import { dashboardKpiValue, dashboardPlanningAlertLabel } from "@/features/dashboard/lib/dashboard-kpi-value";
import {
  getDashboardAnalytics,
  getDashboardKpis,
  type DashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { CACHE_TTL, cacheKey, getCache, setCache } from "@/lib/cache/redis";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

export type DashboardBriefingSurface = "operations" | "sales";

const briefingMemory = new Map<string, { value: DashboardBriefing; expiresAt: number }>();

function memoryGet(key: string): DashboardBriefing | null {
  const row = briefingMemory.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    briefingMemory.delete(key);
    return null;
  }
  return row.value;
}

function memorySet(key: string, value: DashboardBriefing): void {
  briefingMemory.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL.aiBriefing * 1000,
  });
}

function manilaDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

function briefingCacheKey(
  session: AppSession,
  persona: string,
  surface: DashboardBriefingSurface,
): string {
  return cacheKey(
    "tenant",
    session.user.tenantId,
    "ai-briefing",
    session.user.id,
    persona,
    surface,
    manilaDayKey(),
  );
}

function surfaceHome(surface: DashboardBriefingSurface): {
  title: string;
  href: string;
} {
  switch (surface) {
    case "operations":
      return { title: "Operations", href: "/dashboard/operations" };
    case "sales":
      return { title: "Sales", href: "/dashboard/sales" };
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}

function fallbackBriefing(
  lines: { label: string; value: number }[],
  personaLabel: string,
  surface: DashboardBriefingSurface,
): DashboardBriefing {
  const home = surfaceHome(surface);
  const hot = lines.filter((line) => line.value > 0).slice(0, 3);
  const sentences =
    hot.length > 0
      ? [
          `Good day — here is a ${personaLabel} snapshot from ${home.title}.`,
          hot.map((line) => `${line.label}: ${line.value}`).join(". ") + ".",
          `Open the matching card on ${home.title} to take the next step. Nothing here is auto-approved.`,
        ].slice(0, 3)
      : [
          `Good day — your ${home.title} dashboard looks quiet for a ${personaLabel} today.`,
          "No outstanding counts are showing on the cards you can see.",
          "Use Help & Support if you need the next process step.",
        ];

  return {
    sentences,
    sources: [home],
  };
}

export async function getCachedDashboardBriefing(
  session: AppSession,
  surface: DashboardBriefingSurface = "operations",
): Promise<DashboardBriefing | null> {
  const caps = resolveDashboardCapabilities(session.user.permissions);
  const { persona } = resolveDashboardPersona(session.user.roleSlugs, caps);
  const key = briefingCacheKey(session, persona, surface);
  const local = memoryGet(key);
  if (local) return local;
  const cached = await getCache<DashboardBriefing>(key);
  if (cached) memorySet(key, cached);
  return cached;
}

export async function generateDashboardBriefing(
  session: AppSession,
  options?: { force?: boolean; surface?: DashboardBriefingSurface },
): Promise<DashboardBriefing> {
  const surface = options?.surface ?? "operations";
  const permissions = session.user.permissions;
  const caps = resolveDashboardCapabilities(permissions);
  const { persona, label } = resolveDashboardPersona(session.user.roleSlugs, caps);
  const key = briefingCacheKey(session, persona, surface);

  if (!options?.force) {
    const existing = await getCachedDashboardBriefing(session, surface);
    if (existing) return existing;
  }

  const build = async (): Promise<{ briefing: DashboardBriefing; cache: boolean }> => {
    const fullAccess = resolveFullAccess(permissions);
    const tenantId = session.user.tenantId;
    const userId = session.user.id;
    const home = surfaceHome(surface);

    const wantOps = surface === "operations" && caps.hasOps;
    const wantSales =
      surface === "sales"
        ? caps.showSalesSection
        : surface === "operations" && caps.showSalesThisMonth;

    const [kpis, analytics, sales] = await Promise.all([
      wantOps ? getDashboardKpis(tenantId, userId, fullAccess) : Promise.resolve(null),
      wantOps
        ? getDashboardAnalytics(tenantId, userId, fullAccess)
        : Promise.resolve(null),
      wantSales || surface === "sales"
        ? getDashboardSalesAnalytics(tenantId, userId, fullAccess)
        : Promise.resolve(null),
    ]);

    const kpiLines =
      surface === "operations" && kpis
        ? DASHBOARD_KPI_KEYS.filter((item) => kpiKeyVisible(item, caps)).map((item) => ({
            label: kpiLabel(item, kpis),
            value: dashboardKpiValue(item, kpis),
          }))
        : surface === "sales" && sales
          ? [
              {
                label: "Sales this month",
                value: sales.kpis.salesThisMonth,
              },
              { label: "Open returns", value: sales.kpis.openAtr },
              {
                label: "Returns in progress",
                value: sales.kpis.returnsInProgress,
              },
            ]
          : [];

    const payload =
      surface === "sales"
        ? {
            surface,
            persona: label,
            sales: sales
              ? {
                  salesThisMonth: sales.kpis.salesThisMonth,
                  openAtr: sales.kpis.openAtr,
                  returnsInProgress: sales.kpis.returnsInProgress,
                }
              : null,
          }
        : {
            surface,
            persona: label,
            kpis: kpiLines,
            thisMonth: analytics?.periodSnapshot ?? null,
            compliance: caps.showComplianceCards
              ? {
                  policies: caps.showPolicies,
                  reports: caps.showReports,
                  announcements: caps.showAnnouncements,
                  competitors: caps.showCompetitors,
                }
              : null,
          };

    try {
      const { output } = await generateText({
        model: getAiModel(),
        instructions: buildBriefingSystemPrompt({ persona, personaLabel: label }),
        output: Output.object({ schema: dashboardBriefingSchema }),
        prompt: `Write today's briefing from this ${home.title} Dashboard snapshot:\n${JSON.stringify(payload)}`,
      });

      const parsed = dashboardBriefingSchema.safeParse(output);
      if (!parsed.success) {
        logger.error(
          { message: "briefing output failed schema parse" },
          "ISMS Assist briefing generateText failed",
        );
        const briefing = fallbackBriefing(kpiLines, label, surface);
        await logAiAction({
          tenantId,
          userId,
          action: "ai.briefing.generate",
          metadata: {
            persona,
            surface,
            fallback: true,
            sentenceCount: briefing.sentences.length,
          },
        });
        return { briefing, cache: false };
      }

      const withHomeSources: DashboardBriefing = {
        ...parsed.data,
        sources:
          parsed.data.sources.length > 0
            ? parsed.data.sources.map((source) =>
                source.href === "/dashboard" ? home : source,
              )
            : [home],
      };

      await logAiAction({
        tenantId,
        userId,
        action: "ai.briefing.generate",
        metadata: {
          persona,
          surface,
          sentenceCount: withHomeSources.sentences.length,
        },
      });

      return { briefing: withHomeSources, cache: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assist is unavailable";
      logger.error({ message }, "ISMS Assist briefing generateText failed");
      const briefing = fallbackBriefing(kpiLines, label, surface);
      await logAiAction({
        tenantId,
        userId,
        action: "ai.briefing.generate",
        metadata: { persona, surface, fallback: true },
      });
      return { briefing, cache: false };
    }
  };

  const { briefing, cache } = await build();
  if (cache) {
    memorySet(key, briefing);
    await setCache(key, briefing, CACHE_TTL.aiBriefing);
  }
  return briefing;
}
