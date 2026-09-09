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
import { dashboardKpiValue } from "@/features/dashboard/lib/dashboard-kpi-value";
import {
  getDashboardAnalytics,
  getDashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import { getDashboardSalesAnalytics } from "@/features/dashboard/services/dashboard-sales.service";
import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { CACHE_TTL, cacheKey, getCache, setCache } from "@/lib/cache/redis";
import { hasPermission } from "@/lib/auth/permissions";
import type { AppSession } from "@/lib/auth/session";
import { logger } from "@/lib/shared/logger";

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

function briefingCacheKey(session: AppSession, persona: string): string {
  return cacheKey(
    "tenant",
    session.user.tenantId,
    "ai-briefing",
    session.user.id,
    persona,
    manilaDayKey(),
  );
}

function fallbackBriefing(
  lines: { label: string; value: number }[],
  personaLabel: string,
): DashboardBriefing {
  const hot = lines.filter((line) => line.value > 0).slice(0, 3);
  const sentences =
    hot.length > 0
      ? [
          `Good day — here is a ${personaLabel} snapshot from your Dashboard.`,
          hot
            .map((line) => `${line.label}: ${line.value}`)
            .join(". ") + ".",
          "Open the matching card on the Dashboard to take the next step. Nothing here is auto-approved.",
        ].slice(0, 3)
      : [
          `Good day — your Dashboard looks quiet for a ${personaLabel} today.`,
          "No outstanding counts are showing on the cards you can see.",
          "Use Help & Support if you need the next process step.",
        ];

  return {
    sentences,
    sources: [{ title: "Dashboard", href: "/dashboard" }],
  };
}

export async function getCachedDashboardBriefing(
  session: AppSession,
): Promise<DashboardBriefing | null> {
  const caps = resolveDashboardCapabilities(session.user.permissions);
  const { persona } = resolveDashboardPersona(session.user.roleSlugs, caps);
  const key = briefingCacheKey(session, persona);
  const local = memoryGet(key);
  if (local) return local;
  const cached = await getCache<DashboardBriefing>(key);
  if (cached) memorySet(key, cached);
  return cached;
}

export async function generateDashboardBriefing(
  session: AppSession,
  options?: { force?: boolean },
): Promise<DashboardBriefing> {
  const permissions = session.user.permissions;
  const caps = resolveDashboardCapabilities(permissions);
  const { persona, label } = resolveDashboardPersona(session.user.roleSlugs, caps);
  const key = briefingCacheKey(session, persona);
  
  if (!options?.force) {
    const existing = await getCachedDashboardBriefing(session);
    if (existing) return existing;
  }

  const build = async (): Promise<{ briefing: DashboardBriefing; cache: boolean }> => {
    const fullAccess = resolveFullAccess(permissions);
    const tenantId = session.user.tenantId;
    const userId = session.user.id;

    const [kpis, analytics, sales] = await Promise.all([
      caps.hasOps ? getDashboardKpis(tenantId, userId, fullAccess) : Promise.resolve(null),
      caps.hasOps
        ? getDashboardAnalytics(tenantId, userId, fullAccess)
        : Promise.resolve(null),
      caps.showSalesSection
        ? getDashboardSalesAnalytics(tenantId, userId, fullAccess)
        : Promise.resolve(null),
    ]);

    const kpiLines = kpis
      ? DASHBOARD_KPI_KEYS.filter((item) => kpiKeyVisible(item, caps)).map((item) => ({
          label: kpiLabel(item),
          value: dashboardKpiValue(item, kpis),
        }))
      : [];

    const payload = {
      persona: label,
      kpis: kpiLines,
      thisMonth: analytics?.periodSnapshot ?? null,
      sales: sales
        ? {
            salesThisMonth: sales.kpis.salesThisMonth,
            openAtr: sales.kpis.openAtr,
            returnsInProgress: sales.kpis.returnsInProgress,
          }
        : null,
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
        prompt: `Write today's briefing from this Dashboard snapshot:\n${JSON.stringify(payload)}`,
      });

      const parsed = dashboardBriefingSchema.safeParse(output);
      if (!parsed.success) {
        logger.error(
          { message: "briefing output failed schema parse" },
          "ISMS Assist briefing generateText failed",
        );
        const briefing = fallbackBriefing(kpiLines, label);
        await logAiAction({
          tenantId,
          userId,
          action: "ai.briefing.generate",
          metadata: { persona, fallback: true, sentenceCount: briefing.sentences.length },
        });
        return { briefing, cache: false };
      }

      await logAiAction({
        tenantId,
        userId,
        action: "ai.briefing.generate",
        metadata: { persona, sentenceCount: parsed.data.sentences.length },
      });

      return { briefing: parsed.data, cache: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assist is unavailable";
      logger.error({ message }, "ISMS Assist briefing generateText failed");
      const briefing = fallbackBriefing(kpiLines, label);
      await logAiAction({
        tenantId,
        userId,
        action: "ai.briefing.generate",
        metadata: { persona, fallback: true },
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
  