import type {
  DashboardAnalytics,
  DashboardKpis,
} from "@/features/dashboard/services/dashboard-kpi.service";
import {
  DASHBOARD_KPI_KEYS,
  kpiKeyVisible,
  resolveDashboardCapabilities,
  resolveDashboardPersona,
  sortDashboardKeys,
  type DashboardCapabilities,
  type DashboardKpiKey,
  type DashboardPersona,
} from "@/features/dashboard/constants/dashboard-permissions";
import {
  OPS_ALERT_KPI_KEYS,
  dashboardKpiValue,
} from "@/features/dashboard/lib/dashboard-kpi-value";

/** Max primary activity cards on the dashboard strip. */
const ACTIVITY_KPI_LIMIT = 4;

export interface DashboardComplianceCard {
  key: string;
  title: string;
  description: string;
  href: string;
}

export interface DashboardViewModel {
  persona: DashboardPersona;
  personaLabel: string;
  caps: DashboardCapabilities;
  kpiKeys: DashboardKpiKey[];
  /** Capability-allowed alert metrics not already in the top activity strip (non-zero only). */
  opsAlertKeys: DashboardKpiKey[];
  showOpsAlerts: boolean;
  showStockChart: boolean;
  showOrderChart: boolean;
  showPeriodSnapshot: boolean;
  showCharts: boolean;
  complianceCards: DashboardComplianceCard[];
  showRecentUsers: boolean;
  hasOps: boolean;
}

function buildComplianceCards(
  caps: DashboardCapabilities,
): DashboardComplianceCard[] {
  if (!caps.showComplianceCards) return [];

  const cards: DashboardComplianceCard[] = [];
  if (caps.showPolicies) {
    cards.push({
      key: "policies",
      title: "Policies",
      description: "Browse and manage controlled documents",
      href: "/policies",
    });
  }
  if (caps.showReports) {
    cards.push({
      key: "reports",
      title: "Reports",
      description: "Run operational and compliance reports",
      href: "/reports/processed-orders",
    });
  }
  if (caps.showAnnouncements) {
    cards.push({
      key: "announcements",
      title: "Announcements",
      description: "Tenant notices and broadcasts",
      href: "/announcements",
    });
  }
  if (caps.showCompetitors) {
    cards.push({
      key: "competitors",
      title: "Competitors",
      description: "Market observations and promotions",
      href: "/competitors",
    });
  }
  return cards;
}

function resolveOpsAlertKeys(
  persona: DashboardPersona,
  caps: DashboardCapabilities,
  kpis: DashboardKpis | null,
  primaryKeys: DashboardKpiKey[],
): DashboardKpiKey[] {
  if (!kpis || !caps.hasOps) return [];

  const primary = new Set(primaryKeys);
  const alertEligible = new Set<DashboardKpiKey>(OPS_ALERT_KPI_KEYS);

  return sortDashboardKeys(
    DASHBOARD_KPI_KEYS.filter(
      (key) =>
        alertEligible.has(key) &&
        kpiKeyVisible(key, caps) &&
        !primary.has(key) &&
        dashboardKpiValue(key, kpis) > 0,
    ),
    persona,
  );
}

export function buildDashboardViewModel(input: {
  permissions: string[] | undefined;
  roleSlugs: string[] | undefined;
  kpis: DashboardKpis | null;
  analytics: DashboardAnalytics | null;
}): DashboardViewModel {
  const caps = resolveDashboardCapabilities(input.permissions);
  const { persona, label } = resolveDashboardPersona(input.roleSlugs, caps);

  const kpiKeys =
    input.kpis && caps.hasOps
      ? sortDashboardKeys(
          DASHBOARD_KPI_KEYS.filter((key) => kpiKeyVisible(key, caps)),
          persona,
        ).slice(0, ACTIVITY_KPI_LIMIT)
      : [];

  const opsAlertKeys = resolveOpsAlertKeys(
    persona,
    caps,
    input.kpis,
    kpiKeys,
  );

  const showStockChart = Boolean(
    caps.hasOps && caps.showStockChart && input.analytics,
  );
  const showOrderChart = Boolean(
    caps.hasOps && caps.showOrderChart && input.analytics,
  );
  const showPeriodSnapshot = Boolean(
    caps.hasOps &&
      input.analytics &&
      (caps.showOrdersThisMonth ||
        caps.showSalesThisMonth ||
        caps.showDeliveryInTransit),
  );

  return {
    persona,
    personaLabel: label,
    caps,
    kpiKeys,
    opsAlertKeys,
    showOpsAlerts: opsAlertKeys.length > 0,
    showStockChart,
    showOrderChart,
    showPeriodSnapshot,
    showCharts:
      showStockChart ||
      showOrderChart ||
      showPeriodSnapshot ||
      opsAlertKeys.length > 0,
    complianceCards: buildComplianceCards(caps),
    showRecentUsers: caps.showRecentUsers,
    hasOps: caps.hasOps,
  };
}
