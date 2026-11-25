import { hasAnyOrderPermission } from "@/features/orders/constants/order-permissions";
import { canAccessLogistics } from "@/features/logistics/constants/logistics-permissions";
import { canAccessSales } from "@/features/sales/constants/sales-permissions";
import { canAccessReturns } from "@/features/returns/constants/returns-permissions";
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
  /** Branch sales overview section (KPIs, charts, rankings). */
  showSalesSection: boolean;
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

/** Approvers and branch managers see tenant-wide dashboard numbers instead of their AOR. */
export function hasDashboardFullAccess(permissions: string[] | undefined): boolean {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

/** Ops / inventory / orders / logistics / planning — Operations dashboard nav + page. */
export function canAccessOperationsDashboard(
  permissions: string[] | undefined,
): boolean {
  const perms = permissions ?? [];
  return (
    hasPermission(perms, "inventory.view") ||
    hasAnyOrderPermission(perms, "view") ||
    canAccessLogistics(perms) ||
    hasPermission(perms, "forecast.view") ||
    hasPermission(perms, "forecast.manage") ||
    hasPermission(perms, "planogram.view") ||
    hasPermission(perms, "planogram.manage")
  );
}

/** Sales overview dashboard nav + page. */
export function canAccessSalesDashboard(
  permissions: string[] | undefined,
): boolean {
  return canAccessSales(permissions) || canAccessReturns(permissions);
}

export function resolveDashboardCapabilities(
  permissions: string[] | undefined,
): DashboardCapabilities {
  const perms = permissions ?? [];
  const hasOps =
    canAccessOperationsDashboard(perms) ||
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
    showOpenAtr: canAccessSales(perms) || canAccessReturns(perms),
    showPlanogramAlerts: hasPlanogram,
    showAllocationGaps: hasForecast,
    showDraftSuggested: hasForecast,
    showOrderChart: canViewOrders,
    showStockChart: hasPermission(perms, "inventory.view"),
    showOrdersThisMonth: canViewOrders,
    showSalesThisMonth: canAccessSales(perms),
    showSalesSection: canAccessSales(perms) || canAccessReturns(perms),
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

/** Workflow checkboxes that mark whose home dashboard a person gets, checked in order. */
const PERSONA_WORK_CHECKBOXES: readonly { persona: DashboardPersona; anyOf: readonly string[] }[] = [
  { persona: "ps", anyOf: ["orders.manual.create"] },
  { persona: "tl", anyOf: ["orders.auto_replenish.approve_tl"] },
  {
    persona: "planning",
    anyOf: [
      "orders.manual.approve_sp",
      "orders.special.approve_sp",
      "orders.auto_replenish.approve_sp",
      "service_centers.orders.approve_sp",
    ],
  },
  { persona: "logistics", anyOf: ["logistics.delivery.dispatch"] },
];

/**
 * Home dashboard from the person's checkboxes. No role name decides it: admin first
 * (Manage users), then the main workflow checkbox (Manual create, Team Leader review,
 * Supply Planning approval, Dispatch), then what the dashboard can show.
 */
export function resolveDashboardPersona(
  caps: DashboardCapabilities,
  permissions: readonly string[] | undefined,
): { persona: DashboardPersona; label: string } {
  const perms = permissions ?? [];
  let persona: DashboardPersona = "ops";

  const byWork = PERSONA_WORK_CHECKBOXES.find((rule) =>
    rule.anyOf.some((slug) => perms.includes(slug)),
  )?.persona;

  if (!caps.hasOps) {
    persona = "compliance";
  } else if (caps.showRecentUsers) {
    persona = "admin";
  } else if (byWork) {
    persona = byWork;
  } else if (caps.showAllocationGaps || caps.showDraftSuggested) {
    persona = "planning";
  } else if (caps.showPendingApprovals && caps.showReports && !caps.showOpenAtr) {
    persona = "ae";
  } else if (caps.showDeliveryInTransit && !caps.showOpenAtr) {
    persona = "logistics";
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
