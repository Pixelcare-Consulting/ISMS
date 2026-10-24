import type { DatasetKey } from "@/features/reporting/datasets/dataset-catalog";

/**
 * Spec format for code-generated Stimulsoft dashboards, plus the layout that
 * turns a spec into desktop and mobile rectangles. Pure: consumed by the
 * template generator (tools/stimulsoft/build-templates.ts) and tests.
 */

export type DashboardElementKind = "INDICATOR" | "DOUGHNUT" | "BAR" | "COLUMN" | "TABLE" | "FILTER";

/** Maps to Stimulsoft data functions (Sum, Count, Avg, DistinctCount). */
export type Aggregate = "SUM" | "COUNT" | "AVG" | "DISTINCT_COUNT";

export interface MeasureSpec {
  column: string;
  aggregate: Aggregate;
}

export interface TableColumnSpec {
  column: string;
  /** Omit for a dimension (grouping) column. */
  aggregate?: Aggregate;
  /** Header text; defaults to the catalog label. */
  label?: string;
}

export interface DashboardElementSpec {
  name: string;
  kind: DashboardElementKind;
  title: string;
  datasetKey: DatasetKey;
  /** Measure for indicators and charts. */
  value?: MeasureSpec;
  /** Dimension for charts and filters. */
  argument?: string;
  /** Table columns in order. */
  columns?: readonly TableColumnSpec[];
  decimals?: 0 | 2;
  /** Keep only the top N arguments by the measure (bar charts). */
  topN?: number;
}

export interface DashboardSectionSpec {
  id: string;
  /**
   * FILTERS: one short row of filter boxes. TILES: one row of equal-width
   * indicators. PANELS: two charts per row. FULL: one element per row.
   */
  layout: "FILTERS" | "TILES" | "PANELS" | "FULL";
  elements: readonly DashboardElementSpec[];
}

export interface DashboardSpec {
  title: string;
  sections: readonly DashboardSectionSpec[];
}

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

export const DASHBOARD_CANVAS = { desktopWidth: 1200, mobileWidth: 480 } as const;

const GAP = 8;

const SECTION_SIZES: Record<
  DashboardSectionSpec["layout"],
  { desktopHeight: number; mobileHeight: number; mobilePerRow: number }
> = {
  // Combo boxes have a fixed ~30px height; a tight row keeps labels aligned with them.
  FILTERS: { desktopHeight: 40, mobileHeight: 40, mobilePerRow: 1 },
  TILES: { desktopHeight: 120, mobileHeight: 150, mobilePerRow: 2 },
  PANELS: { desktopHeight: 340, mobileHeight: 300, mobilePerRow: 1 },
  FULL: { desktopHeight: 360, mobileHeight: 320, mobilePerRow: 1 },
};

function desktopPerRow(section: DashboardSectionSpec): number {
  if (section.layout === "PANELS") return 2;
  if (section.layout === "FULL") return 1;
  // Filters stay compact (max 3 across); tiles share one row.
  return section.layout === "FILTERS" ? Math.max(3, section.elements.length) : section.elements.length;
}

function splitRow(count: number, index: number, totalWidth: number): { left: number; width: number } {
  const width = (totalWidth - GAP * (count - 1)) / count;
  return { left: Math.round(index * (width + GAP)), width: Math.round(width) };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Positions every element top-to-bottom for both the desktop and mobile layouts. */
export function layoutDashboard(spec: DashboardSpec): {
  placements: Map<string, ElementPlacement>;
  desktopHeight: number;
  mobileHeight: number;
} {
  const placements = new Map<string, ElementPlacement>();
  let desktopTop = 0;
  let mobileTop = 0;

  for (const section of spec.sections) {
    if (section.elements.length === 0) continue;
    const size = SECTION_SIZES[section.layout];

    for (const row of chunk(section.elements, desktopPerRow(section))) {
      const slots = section.layout === "FILTERS" ? desktopPerRow(section) : row.length;
      row.forEach((element, i) => {
        const { left, width } = splitRow(slots, i, DASHBOARD_CANVAS.desktopWidth);
        placements.set(element.name, {
          desktop: { left, top: desktopTop, width, height: size.desktopHeight },
          mobile: { left: 0, top: 0, width: 0, height: 0 },
        });
      });
      desktopTop += size.desktopHeight + GAP;
    }

    for (const row of chunk(section.elements, size.mobilePerRow)) {
      row.forEach((element, i) => {
        const { left, width } = splitRow(row.length, i, DASHBOARD_CANVAS.mobileWidth);
        const placement = placements.get(element.name);
        if (placement) placement.mobile = { left, top: mobileTop, width, height: size.mobileHeight };
      });
      mobileTop += size.mobileHeight + GAP;
    }
  }

  return { placements, desktopHeight: desktopTop, mobileHeight: mobileTop };
}

export function dashboardDatasetKeys(spec: DashboardSpec): DatasetKey[] {
  return [...new Set(spec.sections.flatMap((s) => s.elements.map((e) => e.datasetKey)))];
}
