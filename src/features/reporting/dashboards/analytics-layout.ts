import type { DashboardCapabilities } from "@/features/dashboard/constants/dashboard-permissions";
import type { DatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/**
 * Analytics (Dashboards.JS) layout. Shared by the template build script
 * (initial positions) and the page, which drops elements the user's role
 * can't see and re-flows the rest so no gaps are left behind.
 */

export type AnalyticsElementKind = "INDICATOR" | "DOUGHNUT" | "BAR" | "TABLE";

export interface AnalyticsElementSpec {
  name: string;
  kind: AnalyticsElementKind;
  title: string;
  datasetKey: DatasetKey;
  /** Measure column (summed). */
  value?: string;
  /** Dimension column for charts. */
  argument?: string;
  /** Table columns in order. */
  columns?: readonly string[];
  decimals?: 0 | 2;
  /** Same visibility flag the Recharts dashboards use for this widget. */
  capability: keyof DashboardCapabilities;
}

export interface AnalyticsSectionSpec {
  id: string;
  /** "TILES": one row of equal-width indicators. "PANELS": two charts per row. */
  layout: "TILES" | "PANELS";
  elements: readonly AnalyticsElementSpec[];
}

const indicator = (
  name: string,
  title: string,
  datasetKey: DatasetKey,
  value: string,
  capability: keyof DashboardCapabilities,
  decimals: 0 | 2 = 0,
): AnalyticsElementSpec => ({ name, kind: "INDICATOR", title, datasetKey, value, capability, decimals });

export const ANALYTICS_SECTIONS: readonly AnalyticsSectionSpec[] = [
  {
    id: "ops",
    layout: "TILES",
    elements: [
      indicator("OpsPendingApprovals", "Pending approvals", "ops_kpis", "pendingOrderApprovals", "showPendingApprovals"),
      indicator("OpsDeliveryInTransit", "Delivery in transit", "ops_kpis", "deliveryInTransit", "showDeliveryInTransit"),
      indicator("OpsStockOnHand", "Stock on hand", "ops_kpis", "stockCount", "showStock"),
      indicator("OpsOpenAtr", "Open ATR", "ops_kpis", "openAtr", "showOpenAtr"),
      indicator("OpsOrdersThisMonth", "Orders this month", "ops_kpis", "ordersThisMonth", "showOrdersThisMonth"),
      indicator("OpsBelowPlanogram", "Below planogram", "ops_kpis", "belowPlanogramCapacity", "showPlanogramAlerts"),
    ],
  },
  {
    id: "ops-charts",
    layout: "PANELS",
    elements: [
      {
        name: "OpsInventoryByStatus",
        kind: "DOUGHNUT",
        title: "Inventory by status",
        datasetKey: "inventory_by_status",
        argument: "name",
        value: "count",
        capability: "showStockChart",
      },
      {
        name: "OpsOrdersByStatus",
        kind: "BAR",
        title: "Orders by status",
        datasetKey: "orders_by_status",
        argument: "name",
        value: "count",
        capability: "showOrderChart",
      },
    ],
  },
  {
    id: "sales",
    layout: "TILES",
    elements: [
      indicator("SalesCount", "Sales", "sales_kpis", "salesThisMonth", "showSalesThisMonth"),
      indicator("SalesAmount", "Sale amount", "sales_kpis", "saleAmountThisMonth", "showSalesThisMonth", 2),
      indicator("SalesOpenAtr", "Open ATR", "sales_kpis", "openAtr", "showSalesSection"),
      indicator("SalesReturnsInProgress", "Returns in progress", "sales_kpis", "returnsInProgress", "showSalesSection"),
    ],
  },
  {
    id: "sales-charts",
    layout: "PANELS",
    elements: [
      {
        name: "SalesStatusMix",
        kind: "DOUGHNUT",
        title: "Sale status mix",
        datasetKey: "sale_status_mix",
        argument: "name",
        value: "count",
        capability: "showSalesSection",
      },
      {
        name: "SalesAtrReturnPipeline",
        kind: "BAR",
        title: "ATR and return pipeline",
        datasetKey: "atr_return_pipeline",
        argument: "name",
        value: "count",
        capability: "showSalesSection",
      },
      {
        name: "SalesTopBranches",
        kind: "BAR",
        title: "Top branches by sale amount",
        datasetKey: "top_branches",
        argument: "name",
        value: "value",
        decimals: 2,
        capability: "showSalesSection",
      },
      {
        name: "SalesTopModels",
        kind: "TABLE",
        title: "Top models by units sold",
        datasetKey: "top_models",
        columns: ["name", "value"],
        capability: "showSalesSection",
      },
    ],
  },
];

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ElementPlacement {
  desktop: Rect;
  mobile: Rect;
}

export const ANALYTICS_CANVAS = { desktopWidth: 1200, mobileWidth: 480 } as const;

const GAP = 8;
const TILE_HEIGHT = 120;
const PANEL_HEIGHT = 340;
const MOBILE_TILE_HEIGHT = 110;
const MOBILE_PANEL_HEIGHT = 300;
const MOBILE_TILES_PER_ROW = 2;
const PANELS_PER_ROW = 2;

function splitRow(count: number, index: number, totalWidth: number): { left: number; width: number } {
  const width = (totalWidth - GAP * (count - 1)) / count;
  return { left: Math.round(index * (width + GAP)), width: Math.round(width) };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Positions the visible elements top-to-bottom. Sections with nothing visible
 * collapse; tiles in a row widen to fill the space of hidden siblings.
 */
export function layoutAnalytics(isVisible: (element: AnalyticsElementSpec) => boolean): {
  placements: Map<string, ElementPlacement>;
  desktopHeight: number;
  mobileHeight: number;
} {
  const placements = new Map<string, ElementPlacement>();
  let desktopTop = 0;
  let mobileTop = 0;

  for (const section of ANALYTICS_SECTIONS) {
    const visible = section.elements.filter(isVisible);
    if (visible.length === 0) continue;

    const desktopPerRow = section.layout === "TILES" ? visible.length : PANELS_PER_ROW;
    const mobilePerRow = section.layout === "TILES" ? MOBILE_TILES_PER_ROW : 1;
    const desktopHeight = section.layout === "TILES" ? TILE_HEIGHT : PANEL_HEIGHT;
    const mobileHeight = section.layout === "TILES" ? MOBILE_TILE_HEIGHT : MOBILE_PANEL_HEIGHT;

    for (const row of chunk(visible, desktopPerRow)) {
      row.forEach((element, i) => {
        const { left, width } = splitRow(row.length, i, ANALYTICS_CANVAS.desktopWidth);
        placements.set(element.name, {
          desktop: { left, top: desktopTop, width, height: desktopHeight },
          mobile: { left: 0, top: 0, width: 0, height: 0 },
        });
      });
      desktopTop += desktopHeight + GAP;
    }

    for (const row of chunk(visible, mobilePerRow)) {
      row.forEach((element, i) => {
        const { left, width } = splitRow(row.length, i, ANALYTICS_CANVAS.mobileWidth);
        const placement = placements.get(element.name);
        if (placement) placement.mobile = { left, top: mobileTop, width, height: mobileHeight };
      });
      mobileTop += mobileHeight + GAP;
    }
  }

  return { placements, desktopHeight: desktopTop, mobileHeight: mobileTop };
}

export const ANALYTICS_DATASET_KEYS: DatasetKey[] = [
  ...new Set(ANALYTICS_SECTIONS.flatMap((s) => s.elements.map((e) => e.datasetKey))),
];
