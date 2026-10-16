import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { HELP_FAQ_CATEGORIES } from "@/content/help-support";
import { INVENTORY_MODULE_GUIDE } from "@/content/module-guides/inventory";
import { DELIVERIES_MODULE_GUIDE } from "@/content/module-guides/logistics";
import { MANUAL_ORDERS_MODULE_GUIDE } from "@/content/module-guides/orders";
import { PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PLANNING_MODULE_GUIDE } from "@/content/module-guides/planning";
import { RETURNS_MODULE_GUIDE } from "@/content/module-guides/returns";
import { SALES_MODULE_GUIDE } from "@/content/module-guides/sales";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import type { ModuleGuideContent } from "@/content/module-guides/types";
import { WAREHOUSE_STOCK_MODULE_GUIDE } from "@/content/module-guides/warehouse-stock";
import { BRANCHES_PAGE_TUTORIAL } from "@/content/page-tutorials/branches";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard";
import { DELIVERIES_PAGE_TUTORIAL } from "@/content/page-tutorials/deliveries";
import { INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/inventory";
import { MONTHLY_SIR_PAGE_TUTORIAL } from "@/content/page-tutorials/monthly-sir";
import { OPERATIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/operations";
import { PCOUNT_DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/pcount-dashboard";
import { PLANOGRAM_PAGE_TUTORIAL } from "@/content/page-tutorials/planogram";
import { PLANNING_PAGE_TUTORIAL } from "@/content/page-tutorials/planning";
import { POLICIES_PAGE_TUTORIAL } from "@/content/page-tutorials/policies";
import { RETURNS_PAGE_TUTORIAL } from "@/content/page-tutorials/returns";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import { SERVICE_CENTERS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-centers";
import { STOCK_COUNT_PAGE_TUTORIAL } from "@/content/page-tutorials/stock-count";
import { WAREHOUSE_STOCK_PAGE_TUTORIAL } from "@/content/page-tutorials/warehouse-stock";
import {
  formatHelpHitsForPrompt,
  searchHelpCorpus,
  type HelpSearchHit,
} from "@/features/ai/services/help-corpus.service";
import { hasPermission } from "@/lib/auth/permissions";

/** Allowlisted modules for explainIsmsWorkflow. */
export const WORKFLOW_MODULES = [
  "pcount",
  "monthly_sir",
  "deliveries",
  "operations",
  "sales",
  "orders",
  "returns",
  "logistics",
  "inventory",
  "planning",
  "planogram",
  "quotas",
  "dashboard",
  "reports",
  "service_centers",
  "policies",
  "sap",
  "branches",
  "warehouse_stock",
] as const;

export type WorkflowModule = (typeof WORKFLOW_MODULES)[number];

export type WorkflowModuleConfig = {
  sourceHref: string;
  /** Permission slug required to explain (optional — Help-only modules omit). */
  permissionGate?: string;
  tutorial?: PageTutorialContent;
  /** Extra tutorials merged into tips (e.g. P-Count dashboard). */
  extraTutorials?: PageTutorialContent[];
  moduleGuide?: ModuleGuideContent;
  /** Default Help search query when user omits query. */
  defaultQuery: string;
  /** Filter Help hits after search. */
  helpFilter: (hit: HelpSearchHit) => boolean;
  limitation: string;
};

const MAX_TIP_CHARS = 220;
const MAX_TUTORIAL_TIPS = 6;
const MAX_GUIDE_TIPS = 5;
const MAX_HELP_HITS = 4;

function clipTip(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > MAX_TIP_CHARS
    ? `${compact.slice(0, MAX_TIP_CHARS - 1)}…`
    : compact;
}

function tutorialTips(tutorial: PageTutorialContent): string[] {
  const tips: string[] = [];
  for (const section of tutorial.sections) {
    if (section.bullets?.length) {
      tips.push(clipTip(`${section.title}: ${section.bullets.join(" → ")}`));
    } else if (section.description) {
      tips.push(clipTip(`${section.title}: ${section.description}`));
    }
  }
  return tips.slice(0, MAX_TUTORIAL_TIPS);
}

function sapFaqHits(): HelpSearchHit[] {
  const category = HELP_FAQ_CATEGORIES.find((c) => c.id === "sap-settings");
  if (!category) return [];
  return category.items.map((item) => ({
    id: `faq:${item.id}`,
    title: item.question,
    kind: "faq" as const,
    href: "/settings/sap-integration",
    excerpt: item.answer,
  }));
}

export const WORKFLOW_MODULE_MAP: Record<WorkflowModule, WorkflowModuleConfig> = {
  pcount: {
    sourceHref: "/inventory/stock-count",
    permissionGate: "inventory.view",
    tutorial: STOCK_COUNT_PAGE_TUTORIAL,
    extraTutorials: [PCOUNT_DASHBOARD_PAGE_TUTORIAL],
    defaultQuery: "P-Count stock count physical inventory",
    helpFilter: (hit) =>
      hit.href?.includes("stock-count") ||
      hit.href?.includes("pcount") ||
      /p-?count|stock count|physical count/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For open session status on a branch, call getPcountStatus. Does not invent SAP IDoc mappings or post differences for you.",
  },
  monthly_sir: {
    sourceHref: "/inventory/monthly-sir",
    permissionGate: "inventory.view",
    tutorial: MONTHLY_SIR_PAGE_TUTORIAL,
    defaultQuery: "Monthly SIR P-COUNT upload",
    helpFilter: (hit) =>
      hit.href?.includes("monthly-sir") ||
      /monthly sir|p-count workbook|upload p-count/i.test(
        `${hit.title} ${hit.excerpt}`,
      ),
    limitation:
      "For recent request status or upload allowance, call listMonthlySirStatus. Does not submit or approve SIR requests.",
  },
  deliveries: {
    sourceHref: "/logistics/deliveries",
    tutorial: DELIVERIES_PAGE_TUTORIAL,
    moduleGuide: DELIVERIES_MODULE_GUIDE,
    defaultQuery: "deliveries logistics DIT",
    helpFilter: (hit) =>
      hit.href?.includes("/logistics/deliveries") ||
      hit.href?.includes("/deliveries") ||
      /delivery|deliveries|dit/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For a specific delivery number, call findDeliveryStatus. For acceptance queues, call listOpsInbox.",
  },
  operations: {
    sourceHref: "/operations",
    permissionGate: "inventory.view",
    tutorial: OPERATIONS_PAGE_TUTORIAL,
    defaultQuery: "operations delivery acceptance transfer pull-out",
    helpFilter: (hit) =>
      hit.href?.includes("/operations") ||
      /operations|accept delivery|transfer|pull-?out/i.test(
        `${hit.title} ${hit.excerpt}`,
      ),
    limitation:
      "For items waiting on acceptance, call listOpsInbox. Pixelcare AI cannot accept or reject deliveries.",
  },
  sales: {
    sourceHref: "/sales",
    tutorial: SALES_PAGE_TUTORIAL,
    moduleGuide: SALES_MODULE_GUIDE,
    defaultQuery: "sales invoice serial",
    helpFilter: (hit) =>
      hit.href?.includes("/sales") ||
      /sales|invoice/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "No invoice lookup here — open Sales (/sales) for invoices and serials.",
  },
  orders: {
    sourceHref: "/orders",
    tutorial: BRANCH_ORDERS_PAGE_TUTORIAL,
    moduleGuide: MANUAL_ORDERS_MODULE_GUIDE,
    defaultQuery: "branch orders approval",
    helpFilter: (hit) =>
      hit.href?.includes("/orders") ||
      /order|replenish|approval/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For a specific order number, call findOrderStatus. Pixelcare AI cannot create or approve orders.",
  },
  returns: {
    sourceHref: "/returns",
    tutorial: RETURNS_PAGE_TUTORIAL,
    moduleGuide: RETURNS_MODULE_GUIDE,
    defaultQuery: "returns replacement ATR",
    helpFilter: (hit) =>
      hit.href?.includes("/returns") ||
      /return|replacement|atr/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For a specific ATR / RS / transaction number, call findReturnStatus. Open /returns for full queues.",
  },
  logistics: {
    sourceHref: "/logistics/deliveries",
    tutorial: DELIVERIES_PAGE_TUTORIAL,
    moduleGuide: DELIVERIES_MODULE_GUIDE,
    defaultQuery: "logistics deliveries transfers pullouts",
    helpFilter: (hit) =>
      hit.href?.includes("/logistics") ||
      /logistics|delivery|transfer|pull-?out/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For KPI totals call getLogisticsKpis; for a delivery number call findDeliveryStatus.",
  },
  inventory: {
    sourceHref: "/inventory",
    permissionGate: "inventory.view",
    tutorial: INVENTORY_PAGE_TUTORIAL,
    moduleGuide: INVENTORY_MODULE_GUIDE,
    defaultQuery: "stock units inventory STK",
    helpFilter: (hit) =>
      hit.href === "/inventory" ||
      hit.href?.startsWith("/inventory?") ||
      hit.href?.includes("/inventory") ||
      /stock units|inventory|stk/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For live branch STK, call checkBranchStock. Warehouse serials are under warehouse_stock.",
  },
  planning: {
    sourceHref: "/settings/planning",
    tutorial: PLANNING_PAGE_TUTORIAL,
    moduleGuide: PLANNING_MODULE_GUIDE,
    defaultQuery: "demand planning coverage allocation",
    helpFilter: (hit) =>
      hit.href?.includes("/settings/planning") ||
      hit.href?.includes("demand-planning") ||
      /planning|forecast|allocation|coverage/i.test(
        `${hit.title} ${hit.excerpt}`,
      ),
    limitation:
      "For live runs/coverage/gaps, use listDemandPlanningRuns, getCoverageMonitor, or listAllocationGaps. Does not invent forecast math.",
  },
  planogram: {
    sourceHref: "/settings/planogram",
    tutorial: PLANOGRAM_PAGE_TUTORIAL,
    moduleGuide: PLANOGRAM_MODULE_GUIDE,
    defaultQuery: "planogram Shelf max MIL",
    helpFilter: (hit) =>
      hit.href?.includes("planogram") ||
      /planogram|shelf max|mil/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For Shelf max vs STK gaps call explainShelfGaps; for alert counts call getPlanogramAlerts.",
  },
  quotas: {
    sourceHref: "/settings/branch-quotas",
    defaultQuery: "branch quotas",
    helpFilter: (hit) =>
      hit.href?.includes("branch-quotas") ||
      /quota/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For live quota rows call listBranchQuotas. Does not invent quota formulas.",
  },
  dashboard: {
    sourceHref: "/dashboard",
    tutorial: DASHBOARD_PAGE_TUTORIAL,
    defaultQuery: "dashboard overview operations",
    helpFilter: (hit) =>
      hit.href?.includes("/dashboard") ||
      /dashboard|overview/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "For live KPI numbers call getDashboardSnapshot when the user has Dashboard access.",
  },
  reports: {
    sourceHref: "/reports",
    defaultQuery: "reports inventory demand planning",
    helpFilter: (hit) =>
      hit.href?.includes("/reports") ||
      /report/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "Open the Reports screens for full exports; Pixelcare AI does not run report jobs.",
  },
  service_centers: {
    sourceHref: "/service-centers",
    tutorial: SERVICE_CENTERS_PAGE_TUTORIAL,
    moduleGuide: SC_OPS_MODULE_GUIDE,
    defaultQuery: "service centers inventory",
    helpFilter: (hit) =>
      hit.href?.includes("service-center") ||
      /service center/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "Open Service Centers for live queues and inventory; Pixelcare AI cannot run service-center actions.",
  },
  policies: {
    sourceHref: "/policies",
    tutorial: POLICIES_PAGE_TUTORIAL,
    defaultQuery: "policies controlled documents",
    helpFilter: (hit) =>
      hit.href?.includes("/policies") ||
      /polic/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "Does not create or edit policies — open Policies to manage controlled documents.",
  },
  sap: {
    sourceHref: "/settings/sap-integration",
    tutorial: BRANCHES_PAGE_TUTORIAL,
    defaultQuery: "SAP integration sync Service Layer",
    helpFilter: (hit) =>
      hit.href?.includes("sap") ||
      /sap|service layer|sync from sap/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "Does not invent IDoc/API mappings, job schedules, or credentials. Admins with sap.manage can call getSapIntegrationOverview for connection state. Others use Settings → SAP integration.",
  },
  branches: {
    sourceHref: "/settings/branches",
    tutorial: BRANCHES_PAGE_TUTORIAL,
    defaultQuery: "branches SAP code Sync from SAP",
    helpFilter: (hit) =>
      hit.href?.includes("/settings/branches") ||
      /branch|sap code|sync from sap/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "SAP owns SAP Code and Branch Name — Sync from SAP adds/updates; there is no Add branch in ISMS.",
  },
  warehouse_stock: {
    sourceHref: "/inventory/warehouse-stock",
    permissionGate: "inventory.view",
    tutorial: WAREHOUSE_STOCK_PAGE_TUTORIAL,
    moduleGuide: WAREHOUSE_STOCK_MODULE_GUIDE,
    defaultQuery: "warehouse stock serials",
    helpFilter: (hit) =>
      hit.href?.includes("warehouse-stock") ||
      /warehouse stock/i.test(`${hit.title} ${hit.excerpt}`),
    limitation:
      "Warehouse serials are separate from branch Stock units. Call checkBranchStock for branch STK.",
  },
};

export type ExplainWorkflowPayload = {
  sample: boolean;
  label?: string;
  retrievedAt: string;
  sourceHref: string;
  module: WorkflowModule;
  tutorial?: {
    title: string;
    description?: string;
    tips: string[];
  };
  moduleGuide?: {
    title: string;
    description: string;
    tips: string[];
  };
  helpHits: Array<{ title: string; href?: string | null; excerpt: string }>;
  formatted: string;
  limitation: string;
  error?: string;
};

export function buildExplainPayload(input: {
  module: WorkflowModule;
  query?: string;
  sampleMode: boolean;
  permissions: string[] | undefined;
  retrievedAt: string;
}): ExplainWorkflowPayload {
  const config = WORKFLOW_MODULE_MAP[input.module];

  if (
    config.permissionGate &&
    !input.sampleMode &&
    !hasPermission(input.permissions, config.permissionGate)
  ) {
    return {
      sample: false,
      retrievedAt: input.retrievedAt,
      sourceHref: config.sourceHref,
      module: input.module,
      helpHits: [],
      formatted: "",
      limitation: config.limitation,
      error: `This workflow is outside your access (needs ${config.permissionGate}). Ask an admin, or open ${config.sourceHref}.`,
    };
  }

  const searchQuery = input.query?.trim() || config.defaultQuery;
  let hits = searchHelpCorpus(searchQuery, MAX_HELP_HITS + 2).filter(
    config.helpFilter,
  );

  if (input.module === "sap") {
    const faq = sapFaqHits();
    // Prefer SAP FAQ + filtered Help; keep payload small for tool limits
    hits = [...faq, ...hits.filter((h) => !h.id.startsWith("faq:sap-"))].slice(
      0,
      MAX_HELP_HITS,
    );
  }

  if (hits.length === 0) {
    hits = searchHelpCorpus(config.defaultQuery, MAX_HELP_HITS).filter(
      config.helpFilter,
    );
  }
  if (hits.length === 0) {
    hits = searchHelpCorpus(config.defaultQuery, MAX_HELP_HITS);
  }
  hits = hits.slice(0, MAX_HELP_HITS);

  const primaryTips = config.tutorial ? tutorialTips(config.tutorial) : [];
  const extraTips = (config.extraTutorials ?? [])
    .flatMap(tutorialTips)
    .slice(0, 2);
  const tutorialTipsList = [...primaryTips, ...extraTips].slice(
    0,
    MAX_TUTORIAL_TIPS,
  );

  const helpHits = hits.map((hit) => ({
    title: hit.title,
    href: hit.href,
    excerpt: clipTip(hit.excerpt),
  }));

  return {
    sample: input.sampleMode,
    label: input.sampleMode ? "SAMPLE MODE — workflow explanation" : undefined,
    retrievedAt: input.retrievedAt,
    sourceHref: config.sourceHref,
    module: input.module,
    tutorial: config.tutorial
      ? {
          title: config.tutorial.dialogTitle,
          description: config.tutorial.dialogDescription
            ? clipTip(config.tutorial.dialogDescription)
            : undefined,
          tips: tutorialTipsList,
        }
      : tutorialTipsList.length > 0
        ? {
            title: input.module,
            tips: tutorialTipsList,
          }
        : undefined,
    moduleGuide: config.moduleGuide
      ? {
          title: config.moduleGuide.title,
          description: clipTip(config.moduleGuide.description),
          tips: config.moduleGuide.tips
            .slice(0, MAX_GUIDE_TIPS)
            .map((tip) => clipTip(tip.label)),
        }
      : undefined,
    helpHits,
    formatted: formatHelpHitsForPrompt(
      helpHits.map((hit, index) => ({
        id: hits[index]?.id ?? `hit-${index}`,
        title: hit.title,
        kind: hits[index]?.kind ?? "faq",
        href: hit.href,
        excerpt: hit.excerpt,
      })),
    ),
    limitation: config.limitation,
  };
}
