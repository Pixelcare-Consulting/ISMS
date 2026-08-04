import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { canAccessLogistics } from "@/features/logistics/constants/logistics-permissions";
import { canAccessSales } from "@/features/sales/constants/sales-permissions";
import { hasPermission } from "@/lib/auth/permissions";

export type DashboardPersona =
  | "ps"
  | "tl"
  | "planning"
  | "logistics"
  | "ae"
  | "admin"
  | "compliance"
  | "ops";

export interface DashboardCapabilities {
  hasOps: boolean;
  showPendingApprovals: boolean;
  showDeliveryInTransit: boolean;
  showStock: boolean;
  showOpenAtr: boolean;
  showPlanogramAlerts: boolean;
  showAllocationGaps: boolean;
  showDraftSuggested: boolean;
  showOrderChart: boolean;
  showStockChart: boolean;
  /** Orders created this calendar month (period snapshot). */
  showOrdersThisMonth: boolean;
  /** Sales transactions this calendar month (period snapshot). */
  showSalesThisMonth: boolean;
  showRecentUsers: boolean;
  showPolicies: boolean;
  showReports: boolean;
  showAnnouncements: boolean;
  showCompetitors: boolean;
  showComplianceCards: boolean;
}

export type DashboardKpiKey =
  | "pendingOrderApprovals"
  | "deliveryInTransit"
  | "stockCount"
  | "openAtr"
  | "belowPlanogramCapacity"
  | "milBreaches"
  | "allocationGaps"
  | "draftSuggestedOrders";

export const DASHBOARD_KPI_KEYS: DashboardKpiKey[] = [
  "pendingOrderApprovals",
  "deliveryInTransit",
  "stockCount",
  "openAtr",
  "belowPlanogramCapacity",
  "milBreaches",
  "allocationGaps",
  "draftSuggestedOrders",
];

/** Soft UX labels — role slugs only, not ACL. */
const PERSONA_LABELS: Record<DashboardPersona, string> = {
  ps: "Product Specialist",
  tl: "Team Leader",
  planning: "Supply Planning",
  logistics: "Logistics",
  ae: "Area Executive",
  admin: "Administrator",
  compliance: "Compliance",
  ops: "Operations",
};

const PERSONA_KPI_ORDER: Record<DashboardPersona, DashboardKpiKey[]> = {
  tl: [
    "pendingOrderApprovals",
    "openAtr",
    "stockCount",
    "milBreaches",
    "belowPlanogramCapacity",
    "deliveryInTransit",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
  logistics: [
    "deliveryInTransit",
    "stockCount",
    "openAtr",
    "pendingOrderApprovals",
    "milBreaches",
    "belowPlanogramCapacity",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
  planning: [
    "allocationGaps",
    "draftSuggestedOrders",
    "milBreaches",
    "pendingOrderApprovals",
    "stockCount",
    "belowPlanogramCapacity",
    "openAtr",
    "deliveryInTransit",
  ],
  ps: [
    "stockCount",
    "openAtr",
    "belowPlanogramCapacity",
    "milBreaches",
    "deliveryInTransit",
    "pendingOrderApprovals",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
  ae: [
    "stockCount",
    "milBreaches",
    "belowPlanogramCapacity",
    "pendingOrderApprovals",
    "deliveryInTransit",
    "openAtr",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
  admin: [
    "pendingOrderApprovals",
    "deliveryInTransit",
    "stockCount",
    "openAtr",
    "belowPlanogramCapacity",
    "milBreaches",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
  compliance: [],
  ops: [
    "pendingOrderApprovals",
    "deliveryInTransit",
    "stockCount",
    "openAtr",
    "belowPlanogramCapacity",
    "milBreaches",
    "allocationGaps",
    "draftSuggestedOrders",
  ],
};

export function resolveDashboardCapabilities(
  permissions: string[] | undefined,
): DashboardCapabilities {
  const perms = permissions ?? [];
  const hasOps =
    hasPermission(perms, "inventory.view") ||
    hasAnyOrderPermission(perms, "view") ||
    hasPermission(perms, "sales.create");

  const canApproveOrders = hasAnyOrderPermission(perms, "approve");
  const canViewOrders = hasAnyOrderPermission(perms, "view");
  const canCreateOrders = hasAnyOrderPermission(perms, "create");
  const hasForecast =
    hasPermission(perms, "forecast.view") ||
    hasPermission(perms, "forecast.manage");
  const hasPlanogram =
    hasPermission(perms, "planogram.view") ||
    hasPermission(perms, "planogram.manage");

  const showPolicies =
    hasPermission(perms, "policies.view") ||
    hasPermission(perms, "policies.create") ||
    hasPermission(perms, "policies.approve");
  const showReports = hasPermission(perms, "reports.view");
  const showAnnouncements =
    hasPermission(perms, "announcements.view") ||
    hasPermission(perms, "announcements.manage");
  const showCompetitors =
    hasPermission(perms, "competitors.view") ||
    hasPermission(perms, "competitors.manage");

  /** Approvers see pending; AE-style (view + reports, no create/approve) also sees counts. */
  const showPendingApprovals =
    canApproveOrders ||
    (canViewOrders && showReports && !canCreateOrders && !canApproveOrders);

  return {
    hasOps,
    showPendingApprovals,
    showDeliveryInTransit:
      canAccessLogistics(perms) || hasPermission(perms, "inventory.view"),
    showStock: hasPermission(perms, "inventory.view"),
    showOpenAtr: canAccessSales(perms),
    showPlanogramAlerts: hasPlanogram,
    showAllocationGaps: hasForecast,
    showDraftSuggested: hasForecast,
    showOrderChart: canViewOrders,
    showStockChart: hasPermission(perms, "inventory.view"),
    showOrdersThisMonth: canViewOrders,
    showSalesThisMonth: canAccessSales(perms),
    showRecentUsers: hasPermission(perms, "users.manage"),
    showPolicies,
    showReports,
    showAnnouncements,
    showCompetitors,
    showComplianceCards:
      !hasOps &&
      (showPolicies || showReports || showAnnouncements || showCompetitors),
  };
}

export function resolveDashboardPersona(
  roleSlugs: string[] | undefined,
  caps: DashboardCapabilities,
): { persona: DashboardPersona; label: string } {
  const slugs = roleSlugs ?? [];

  let persona: DashboardPersona = "ops";

  if (!caps.hasOps) {
    persona = "compliance";
  } else if (
    slugs.some((s) => s === "super_admin" || s === "tenant_admin") ||
    caps.showRecentUsers
  ) {
    persona = "admin";
  } else if (slugs.includes("ps")) {
    persona = "ps";
  } else if (slugs.includes("tl")) {
    persona = "tl";
  } else if (
    slugs.some(
      (s) =>
        s === "sp" ||
        s === "spa" ||
        s === "supply_planning" ||
        s === "supply_planning_associate",
    )
  ) {
    persona = "planning";
  } else if (slugs.includes("logistics")) {
    persona = "logistics";
  } else if (slugs.includes("ae")) {
    persona = "ae";
  } else if (caps.showAllocationGaps || caps.showDraftSuggested) {
    persona = "planning";
  } else if (caps.showDeliveryInTransit && !caps.showOpenAtr) {
    persona = "logistics";
  } else if (caps.showPendingApprovals && caps.showReports && !caps.showOpenAtr) {
    persona = "ae";
  } else if (caps.showStock && caps.showOpenAtr && !caps.showPendingApprovals) {
    persona = "ps";
  } else if (caps.showPendingApprovals) {
    persona = "tl";
  }

  return { persona, label: PERSONA_LABELS[persona] };
}

export function kpiKeyVisible(
  key: DashboardKpiKey,
  caps: DashboardCapabilities,
): boolean {
  switch (key) {
    case "pendingOrderApprovals":
      return caps.showPendingApprovals;
    case "deliveryInTransit":
      return caps.showDeliveryInTransit;
    case "stockCount":
      return caps.showStock;
    case "openAtr":
      return caps.showOpenAtr;
    case "belowPlanogramCapacity":
    case "milBreaches":
      return caps.showPlanogramAlerts;
    case "allocationGaps":
      return caps.showAllocationGaps;
    case "draftSuggestedOrders":
      return caps.showDraftSuggested;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function sortDashboardKeys(
  keys: DashboardKpiKey[],
  persona: DashboardPersona,
): DashboardKpiKey[] {
  const order = PERSONA_KPI_ORDER[persona];
  if (order.length === 0) return keys;
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...keys].sort(
    (a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99),
  );
}
