/**
 * Generates the Stimulsoft templates (.mrt JSON) committed under
 * src/features/reporting/templates from the shared specs:
 *   - REPORT_DEFINITIONS  → templates/reports/<key>.mrt.json
 *   - READY_MADE_DASHBOARDS → templates/dashboards/ready-made/<key>.mrt.json
 *   - blank dashboard       → templates/dashboards/blank.mrt.json (new custom dashboards)
 *
 * Run: pnpm reporting:templates
 * Re-run after changing a spec or the dataset catalog. Output is deterministic
 * apart from Stimulsoft's own timestamps/GUIDs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Stimulsoft as StimulsoftNamespace } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

import {
  READY_MADE_DASHBOARDS,
  type ReadyMadeDashboard,
  type ReadyMadeDashboardKey,
} from "../../src/features/custom-dashboards/ready-made/ready-made-dashboards";
import {
  DASHBOARD_CANVAS,
  dashboardDatasetKeys,
  layoutDashboard,
  type Aggregate,
  type DashboardElementSpec,
  type DashboardSpec,
  type MeasureSpec,
} from "../../src/features/reporting/dashboards/dashboard-layout";
import {
  DATASET_CATALOG,
  type DatasetColumn,
  type DatasetKey,
} from "../../src/features/reporting/datasets/dataset-catalog";
import { ensureDataSources } from "../../src/features/reporting/lib/create-report";
import { ISMS_THEME } from "../../src/features/reporting/lib/reporting-theme";
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
  type ReportKey,
  type ReportSectionSpec,
} from "../../src/features/reporting/reports/report-definitions";

type Sti = typeof StimulsoftNamespace;

const OUT_DIR = path.resolve(__dirname, "../../src/features/reporting/templates");

/** Print palette from the shared ISMS theme (white paper, app neutrals, teal accent). */
const COLORS = {
  ink: ISMS_THEME.colors.foreground,
  muted: ISMS_THEME.colors.mutedForeground,
  rule: ISMS_THEME.colors.border,
  headerFill: ISMS_THEME.colors.muted,
  groupFill: ISMS_THEME.colors.stripe,
} as const;

const FONT = ISMS_THEME.fontFamily;

async function loadStimulsoft(): Promise<Sti> {
  const { Stimulsoft } = await import("stimulsoft-dashboards-js-react/stimulsoft.reports.engine.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.reports.chart.mjs");
  await import("stimulsoft-dashboards-js-react/stimulsoft.dashboards.mjs");
  return Stimulsoft as Sti;
}

function color(sti: Sti, rgb: readonly [number, number, number]) {
  return sti.System.Drawing.Color.fromArgb(255, rgb[0], rgb[1], rgb[2]);
}

function columnMeta(datasetKey: DatasetKey, name: string): DatasetColumn {
  const column = DATASET_CATALOG[datasetKey].columns.find((c) => c.name === name);
  if (!column) throw new Error(`Unknown column ${datasetKey}.${name}`);
  return column;
}

// ---------------------------------------------------------------- reports --

const PAGE_MARGIN = 1; // cm
const ROW_HEIGHT = 0.6;
const HEADER_HEIGHT = 0.7;

function numberFormat(sti: Sti, decimals: number) {
  const format = new sti.Report.Components.TextFormats.StiNumberFormatService();
  format.decimalDigits = decimals;
  format.useGroupSeparator = true;
  format.groupSeparator = ",";
  format.decimalSeparator = ".";
  // Without the state flags Stimulsoft falls back to the culture defaults.
  const State = sti.Report.Components.StiTextFormatState;
  format.state = State.DecimalDigits | State.DecimalSeparator | State.GroupSeparator;
  return format;
}

function dateFormat(sti: Sti) {
  return new sti.Report.Components.TextFormats.StiDateFormatService("yyyy-MM-dd", "");
}

function textCell(
  sti: Sti,
  opts: {
    name: string;
    text: string;
    left: number;
    top?: number;
    width: number;
    height: number;
    bold?: boolean;
    size?: number;
    align?: "LEFT" | "RIGHT" | "CENTER";
    fill?: readonly [number, number, number];
    foreground?: readonly [number, number, number];
    bottomRule?: boolean;
    /** Wrap long values onto more lines (the row grows) instead of clipping them. */
    wrap?: boolean;
  },
) {
  const t = new sti.Report.Components.StiText();
  t.name = opts.name;
  t.text = opts.text;
  t.left = opts.left;
  t.top = opts.top ?? 0;
  t.width = opts.width;
  t.height = opts.height;
  t.wordWrap = opts.wrap ?? false;
  t.canGrow = opts.wrap ?? false;
  t.growToHeight = opts.wrap ?? false;
  t.vertAlignment = sti.Base.Drawing.StiVertAlignment.Center;
  t.horAlignment =
    opts.align === "RIGHT"
      ? sti.Base.Drawing.StiTextHorAlignment.Right
      : opts.align === "CENTER"
        ? sti.Base.Drawing.StiTextHorAlignment.Center
        : sti.Base.Drawing.StiTextHorAlignment.Left;
  t.font = new sti.System.Drawing.Font(
    FONT,
    opts.size ?? 8,
    opts.bold ? sti.System.Drawing.FontStyle.Bold : sti.System.Drawing.FontStyle.Regular,
  );
  t.textBrush = new sti.Base.Drawing.StiSolidBrush(color(sti, opts.foreground ?? COLORS.ink));
  if (opts.fill) t.brush = new sti.Base.Drawing.StiSolidBrush(color(sti, opts.fill));
  if (opts.bottomRule) {
    t.border = new sti.Base.Drawing.StiBorder(
      sti.Base.Drawing.StiBorderSides.Bottom,
      color(sti, COLORS.rule),
      1,
      sti.Base.Drawing.StiPenStyle.Solid,
    );
  }
  t.margins = new sti.Report.Components.StiMargins(2, 2, 0, 0);
  return t;
}

function columnLayout(section: ReportSectionSpec, usableWidth: number) {
  const totalWeight = section.columns.reduce((sum, c) => sum + c.weight, 0);
  let left = 0;
  return section.columns.map((spec, index) => {
    const width = (spec.weight / totalWeight) * usableWidth;
    const meta = spec.name ? columnMeta(section.datasetKey, spec.name) : null;
    const placed = { spec, meta, left, width, id: spec.name ?? `Blank${index}` };
    left += width;
    return placed;
  });
}

/** Export-style values: dates as yyyy-MM-dd, everything else exactly as the dataset holds it. */
function applyCellFormat(sti: Sti, cell: StimulsoftNamespace.Report.Components.StiText, meta: DatasetColumn | null) {
  if (meta?.type === "date") cell.textFormat = dateFormat(sti);
}

function addSection(
  sti: Sti,
  page: StimulsoftNamespace.Report.Components.StiPage,
  section: ReportSectionSpec,
  index: number,
  usableWidth: number,
  fontSize: number,
) {
  const C = sti.Report.Components;
  const key = section.datasetKey;
  const columns = columnLayout(section, usableWidth);
  const prefix = `S${index}`;
  const isNumber = (meta: DatasetColumn | null) => meta?.type === "number";

  if (section.heading) {
    const heading = new C.StiHeaderBand();
    heading.name = `${prefix}Heading`;
    heading.height = 0.9;
    heading.printOnAllPages = false;
    heading.components.add(
      textCell(sti, { name: `${prefix}HeadingText`, text: section.heading, left: 0, width: usableWidth, height: 0.8, bold: true, size: 11 }),
    );
    if (section.newPage) heading.newPageBefore = true;
    page.components.add(heading);
  }

  const header = new C.StiHeaderBand();
  header.name = `${prefix}ColumnHeader`;
  header.height = HEADER_HEIGHT;
  header.printOnAllPages = true;
  for (const { spec, meta, left, width, id } of columns) {
    header.components.add(
      textCell(sti, {
        name: `${prefix}H_${id}`,
        text: spec.header,
        left,
        width,
        height: HEADER_HEIGHT,
        bold: true,
        size: fontSize,
        align: isNumber(meta) ? "RIGHT" : "LEFT",
        fill: COLORS.headerFill,
        bottomRule: true,
        wrap: true,
      }),
    );
  }
  page.components.add(header);

  if (section.groupBy) {
    const group = new C.StiGroupHeaderBand();
    group.name = `${prefix}Group`;
    group.height = ROW_HEIGHT + 0.1;
    group.condition = `{${key}.${section.groupBy}}`;
    group.components.add(
      textCell(sti, {
        name: `${prefix}GroupText`,
        text: `{${key}.${section.groupBy}}`,
        left: 0,
        width: usableWidth,
        height: ROW_HEIGHT + 0.1,
        bold: true,
        size: fontSize,
        fill: COLORS.groupFill,
      }),
    );
    page.components.add(group);
  }

  const data = new C.StiDataBand();
  data.name = `${prefix}Data`;
  data.dataSourceName = key;
  data.height = ROW_HEIGHT;
  for (const { spec, meta, left, width, id } of columns) {
    const cell = textCell(sti, {
      name: `${prefix}D_${id}`,
      text: spec.name ? `{${key}.${spec.name}}` : "",
      left,
      width,
      height: ROW_HEIGHT,
      size: fontSize,
      align: isNumber(meta) ? "RIGHT" : "LEFT",
      bottomRule: true,
      wrap: true,
    });
    applyCellFormat(sti, cell, meta);
    data.components.add(cell);
  }
  page.components.add(data);

  // Totals only where a spec asks for them (approved exports have none).
  const totals = columns.filter((c) => c.spec.total && c.spec.name);
  if (totals.length === 0) return;

  const totalCell = (name: string, column: (typeof totals)[number], height: number, fill?: readonly [number, number, number]) => {
    const cell = textCell(sti, {
      name,
      text: `{Sum(${data.name},${key}.${column.spec.name})}`,
      left: column.left,
      width: column.width,
      height,
      bold: true,
      size: fontSize,
      align: "RIGHT",
      fill,
    });
    applyCellFormat(sti, cell, column.meta);
    return cell;
  };

  if (section.groupBy) {
    const groupFooter = new C.StiGroupFooterBand();
    groupFooter.name = `${prefix}GroupFooter`;
    groupFooter.height = ROW_HEIGHT;
    for (const column of totals) groupFooter.components.add(totalCell(`${prefix}GF_${column.id}`, column, ROW_HEIGHT));
    page.components.add(groupFooter);
  }

  const footer = new C.StiFooterBand();
  footer.name = `${prefix}Footer`;
  footer.height = ROW_HEIGHT + 0.1;
  footer.components.add(
    textCell(sti, {
      name: `${prefix}RowCount`,
      text: `{Count(${data.name})} rows`,
      left: 0,
      width: usableWidth * 0.3,
      height: ROW_HEIGHT + 0.1,
      size: fontSize,
      foreground: COLORS.muted,
    }),
  );
  for (const column of totals) footer.components.add(totalCell(`${prefix}T_${column.id}`, column, ROW_HEIGHT + 0.1, COLORS.headerFill));
  page.components.add(footer);
}

function buildReport(sti: Sti, key: ReportKey, def: ReportDefinition): string {
  const report = new sti.Report.StiReport();
  report.reportName = key;
  report.reportAlias = def.title;
  report.reportUnit = sti.Report.StiReportUnitType.Centimeters;

  ensureDataSources(sti, report, def.sections.map((section) => section.datasetKey));

  // Filled in at runtime from the page's filter bar.
  report.dictionary.variables.add(new sti.Report.Dictionary.StiVariable("", "FilterSummary", "FilterSummary", "", String as unknown as StimulsoftNamespace.System.Type, "", false));

  const page = report.pages.getByIndex(0);
  page.orientation =
    def.orientation === "LANDSCAPE" ? sti.Report.Components.StiPageOrientation.Landscape : sti.Report.Components.StiPageOrientation.Portrait;
  page.paperSize = sti.System.Drawing.Printing.PaperKind.A4;
  page.pageWidth = def.orientation === "LANDSCAPE" ? 29.7 : 21;
  page.pageHeight = def.orientation === "LANDSCAPE" ? 21 : 29.7;
  page.margins = new sti.Report.Components.StiMargins(PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN);
  const usableWidth = page.pageWidth - PAGE_MARGIN * 2;

  const title = new sti.Report.Components.StiReportTitleBand();
  title.name = "ReportTitle";
  title.height = 1.1;
  title.components.add(textCell(sti, { name: "TitleText", text: def.title, left: 0, width: usableWidth * 0.6, height: 0.8, bold: true, size: 14 }));
  title.components.add(
    textCell(sti, { name: "TitleFilters", text: "{FilterSummary}", left: usableWidth * 0.6, width: usableWidth * 0.4, height: 0.8, align: "RIGHT", foreground: COLORS.muted }),
  );
  page.components.add(title);

  const pageFooter = new sti.Report.Components.StiPageFooterBand();
  pageFooter.name = "PageFooter";
  pageFooter.height = 0.6;
  pageFooter.components.add(
    textCell(sti, { name: "FooterGenerated", text: `Generated {Format("{0:yyyy-MM-dd HH:mm}", DateTime.Now)}`, left: 0, width: usableWidth / 2, height: 0.6, foreground: COLORS.muted, size: 7 }),
  );
  pageFooter.components.add(
    textCell(sti, {
      name: "FooterPage",
      text: "Page {PageNumber} of {TotalPageCount}",
      left: usableWidth / 2,
      width: usableWidth / 2,
      height: 0.6,
      align: "RIGHT",
      foreground: COLORS.muted,
      size: 7,
    }),
  );
  page.components.add(pageFooter);

  def.sections.forEach((section, i) => addSection(sti, page, section, i, usableWidth, def.fontSize ?? 8));

  return report.saveToJsonString();
}

// -------------------------------------------------------------- dashboard --

function rect(sti: Sti, r: { left: number; top: number; width: number; height: number }) {
  return new sti.System.Drawing.Rectangle(r.left, r.top, r.width, r.height);
}

const AGGREGATE_FUNCTION: Record<Aggregate, string> = {
  SUM: "Sum",
  COUNT: "Count",
  AVG: "Avg",
  DISTINCT_COUNT: "DistinctCount",
};

function measureExpression(key: DatasetKey, measure: MeasureSpec): string {
  columnMeta(key, measure.column);
  return `${AGGREGATE_FUNCTION[measure.aggregate]}(${key}.${measure.column})`;
}

function chartSeriesType(sti: Sti, kind: DashboardElementSpec["kind"]) {
  const T = sti.Report.Dashboard.StiChartSeriesType;
  if (kind === "DOUGHNUT") return T.Doughnut;
  return kind === "COLUMN" ? T.ClusteredColumn : T.ClusteredBar;
}

type DashboardElement = StimulsoftNamespace.Dashboard.Components.StiElement;

function titled(el: DashboardElement & { title: { text: string; visible: boolean } }, text: string): DashboardElement {
  el.title.text = text;
  el.title.visible = true;
  return el;
}

function buildElement(sti: Sti, spec: DashboardElementSpec): DashboardElement {
  const DC = sti.Dashboard.Components;
  const key = spec.datasetKey;
  const decimals = spec.decimals ?? 0;

  if (spec.kind === "INDICATOR") {
    const el = new DC.Indicator.StiIndicatorElement();
    el.name = spec.name;
    el.value = new DC.Indicator.StiValueIndicatorMeter(`${spec.name}Value`, measureExpression(key, spec.value!), spec.title);
    el.textFormat = numberFormat(sti, decimals);
    return titled(el, spec.title);
  }

  if (spec.kind === "FILTER") {
    const el = new DC.ComboBox.StiComboBoxElement();
    el.name = spec.name;
    const field = `${key}.${spec.argument}`;
    el.keyMeter = new DC.ComboBox.StiKeyComboBoxMeter(`${spec.name}Key`, field, spec.title);
    el.nameMeter = new DC.ComboBox.StiNameComboBoxMeter(`${spec.name}Name`, field, spec.title);
    el.selectionMode = sti.Report.Dashboard.StiItemSelectionMode.Multi;
    el.showAllValue = true;
    // Combo boxes have no title in Stimulsoft; the "All" entry and values label it.
    return el;
  }

  if (spec.kind === "TABLE") {
    const el = new DC.Table.StiTableElement();
    el.name = spec.name;
    for (const column of spec.columns ?? []) {
      const meta = columnMeta(key, column.column);
      const columnKey = `${spec.name}_${column.column}`;
      const label = column.label ?? meta.label;
      el.columns.push(
        column.aggregate
          ? new DC.Table.StiMeasureColumn(
              columnKey,
              measureExpression(key, { column: column.column, aggregate: column.aggregate }),
              label,
              undefined,
              numberFormat(sti, 0),
            )
          : new DC.Table.StiDimensionColumn(columnKey, `${key}.${column.column}`, label),
      );
    }
    return titled(el, spec.title);
  }

  const el = new DC.Chart.StiChartElement();
  el.name = spec.name;
  const argument = columnMeta(key, spec.argument!);
  const valueKey = `${spec.name}Value`;
  el.insertArgument(0, new DC.Chart.StiArgumentChartMeter(`${spec.name}Argument`, `${key}.${spec.argument}`, argument.label));
  el.insertValue(0, new DC.Chart.StiValueChartMeter(valueKey, measureExpression(key, spec.value!), spec.title, chartSeriesType(sti, spec.kind)));
  el.valueFormat = numberFormat(sti, decimals);
  if (argument.type === "date") el.argumentFormat = dateFormat(sti);
  if (spec.topN) {
    const Engine = sti.Data.Engine;
    el.topN = new Engine.StiDataTopN(Engine.StiDataTopNMode.Top, spec.topN, false, "", valueKey);
    el.transformSorts.push(new Engine.StiDataSortRule(valueKey, Engine.StiDataSortDirection.Descending));
  }
  // Doughnut slice labels collide on small slices; the legend and tooltips carry them.
  if (spec.kind === "DOUGHNUT") el.labels.position = sti.Report.Dashboard.StiChartLabelsPosition.None;
  return titled(el, spec.title);
}

const FILTER_LABEL_WIDTH = 96;

type Slot = { left: number; top: number; width: number; height: number };

function labelSlot(slot: Slot): Slot {
  return { ...slot, width: FILTER_LABEL_WIDTH };
}

function controlSlot(slot: Slot): Slot {
  return { ...slot, left: slot.left + FILTER_LABEL_WIDTH, width: slot.width - FILTER_LABEL_WIDTH };
}

function buildFilterLabel(sti: Sti, spec: DashboardElementSpec): DashboardElement {
  const label = new sti.Dashboard.Components.Text.StiTextElement();
  label.name = `${spec.name}Label`;
  label.text = `<font size="12"><b>${spec.title}</b></font>`;
  label.title.visible = false;
  label.altTitleVisible = false; // the mobile layout has its own title flag
  label.vertAlignment = sti.Base.Drawing.StiVertAlignment.Center;
  return label;
}

/** Generates one dashboard template from a spec (desktop + mobile layout). */
function buildDashboard(sti: Sti, name: string, spec: DashboardSpec): string {
  const report = sti.Report.StiReport.createNewDashboard();
  report.reportName = name;
  report.reportAlias = spec.title;
  ensureDataSources(sti, report, dashboardDatasetKeys(spec));

  const dashboard = report.pages.getByIndex(0) as StimulsoftNamespace.Dashboard.Components.StiDashboard;
  dashboard.name = name.replace(/[^A-Za-z0-9]/g, "");
  dashboard.alias = spec.title;

  const { placements, desktopHeight, mobileHeight } = layoutDashboard(spec);
  dashboard.width = DASHBOARD_CANVAS.desktopWidth;
  dashboard.height = desktopHeight;
  dashboard.altSize = new sti.System.Drawing.Size(DASHBOARD_CANVAS.mobileWidth, mobileHeight);

  for (const element of spec.sections.flatMap((section) => section.elements)) {
    const placement = placements.get(element.name);
    if (!placement) continue;
    const el = buildElement(sti, element);
    if (element.kind === "FILTER") {
      // Combo boxes have no caption, so a text label sits to the left of each.
      const label = buildFilterLabel(sti, element);
      label.clientRectangle = rect(sti, labelSlot(placement.desktop));
      label.altClientRectangle = rect(sti, labelSlot(placement.mobile));
      dashboard.components.add(label);
      el.clientRectangle = rect(sti, controlSlot(placement.desktop));
      el.altClientRectangle = rect(sti, controlSlot(placement.mobile));
    } else {
      el.clientRectangle = rect(sti, placement.desktop);
      el.altClientRectangle = rect(sti, placement.mobile);
    }
    dashboard.components.add(el);
  }

  return report.saveToJsonString();
}

/** Starting point for a new custom dashboard; datasets are added in the designer. */
function buildBlankDashboard(sti: Sti): string {
  const report = sti.Report.StiReport.createNewDashboard();
  report.reportName = "custom-dashboard";
  report.reportAlias = "Custom dashboard";
  return report.saveToJsonString();
}

// ------------------------------------------------------------------- main --

function write(relative: string, json: string) {
  const file = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${json}\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

async function main() {
  const sti = await loadStimulsoft();
  for (const [key, def] of Object.entries(REPORT_DEFINITIONS) as [ReportKey, ReportDefinition][]) {
    write(`reports/${key}.mrt.json`, buildReport(sti, key, def));
  }
  for (const [key, dashboard] of Object.entries(READY_MADE_DASHBOARDS) as [ReadyMadeDashboardKey, ReadyMadeDashboard][]) {
    write(`dashboards/ready-made/${key}.mrt.json`, buildDashboard(sti, key, dashboard.spec));
  }
  write("dashboards/blank.mrt.json", buildBlankDashboard(sti));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
