/**
 * Generates the Stimulsoft templates (.mrt JSON) committed under
 * src/features/reporting/templates from the shared specs:
 *   - REPORT_DEFINITIONS  → templates/reports/<key>.mrt.json
 *   - ANALYTICS_SECTIONS  → templates/dashboards/analytics.mrt.json
 *   - blank dashboard     → templates/dashboards/blank.mrt.json (new custom dashboards)
 *
 * Run: pnpm reporting:templates
 * Re-run after changing a spec or the dataset catalog. Output is deterministic
 * apart from Stimulsoft's own timestamps/GUIDs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Stimulsoft as StimulsoftNamespace } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

import {
  ANALYTICS_CANVAS,
  ANALYTICS_DATASET_KEYS,
  ANALYTICS_SECTIONS,
  layoutAnalytics,
  type AnalyticsElementSpec,
} from "../../src/features/reporting/dashboards/analytics-layout";
import {
  DATASET_CATALOG,
  type DatasetColumn,
  type DatasetKey,
} from "../../src/features/reporting/datasets/dataset-catalog";
import { ensureDataSources } from "../../src/features/reporting/lib/create-report";
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
  type ReportKey,
  type ReportSectionSpec,
} from "../../src/features/reporting/reports/report-definitions";

type Sti = typeof StimulsoftNamespace;

const OUT_DIR = path.resolve(__dirname, "../../src/features/reporting/templates");

/** Brand-neutral, print-friendly palette (matches the app's slate neutrals). */
const COLORS = {
  ink: [15, 23, 42],
  muted: [100, 116, 139],
  rule: [203, 213, 225],
  headerFill: [241, 245, 249],
  groupFill: [248, 250, 252],
} as const;

const FONT = "Arial";

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
  },
) {
  const t = new sti.Report.Components.StiText();
  t.name = opts.name;
  t.text = opts.text;
  t.left = opts.left;
  t.top = opts.top ?? 0;
  t.width = opts.width;
  t.height = opts.height;
  t.wordWrap = false;
  t.canGrow = false;
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
  return section.columns.map((spec) => {
    const width = (spec.weight / totalWeight) * usableWidth;
    const meta = columnMeta(section.datasetKey, spec.name);
    const placed = { spec, meta, left, width };
    left += width;
    return placed;
  });
}

function addSection(
  sti: Sti,
  page: StimulsoftNamespace.Report.Components.StiPage,
  section: ReportSectionSpec,
  index: number,
  usableWidth: number,
) {
  const C = sti.Report.Components;
  const key = section.datasetKey;
  const columns = columnLayout(section, usableWidth);
  const prefix = `S${index}`;

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
  for (const { spec, meta, left, width } of columns) {
    header.components.add(
      textCell(sti, {
        name: `${prefix}H_${spec.name}`,
        text: meta.label,
        left,
        width,
        height: HEADER_HEIGHT,
        bold: true,
        align: meta.type === "number" ? "RIGHT" : "LEFT",
        fill: COLORS.headerFill,
        bottomRule: true,
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
        fill: COLORS.groupFill,
      }),
    );
    page.components.add(group);
  }

  const data = new C.StiDataBand();
  data.name = `${prefix}Data`;
  data.dataSourceName = key;
  data.height = ROW_HEIGHT;
  for (const { spec, meta, left, width } of columns) {
    const cell = textCell(sti, {
      name: `${prefix}D_${spec.name}`,
      text: `{${key}.${spec.name}}`,
      left,
      width,
      height: ROW_HEIGHT,
      align: meta.type === "number" ? "RIGHT" : "LEFT",
      bottomRule: true,
    });
    if (meta.type === "number") cell.textFormat = numberFormat(sti, spec.name === "saleAmount" ? 2 : spec.name === "totalCbm" ? 4 : 0);
    if (meta.type === "date") cell.textFormat = dateFormat(sti);
    data.components.add(cell);
  }
  page.components.add(data);

  const totals = columns.filter((c) => c.spec.total);
  if (section.groupBy && totals.length > 0) {
    const groupFooter = new C.StiGroupFooterBand();
    groupFooter.name = `${prefix}GroupFooter`;
    groupFooter.height = ROW_HEIGHT;
    for (const { spec, left, width } of totals) {
      const cell = textCell(sti, {
        name: `${prefix}GF_${spec.name}`,
        text: `{Sum(${data.name},${key}.${spec.name})}`,
        left,
        width,
        height: ROW_HEIGHT,
        bold: true,
        align: "RIGHT",
      });
      cell.textFormat = numberFormat(sti, spec.name === "saleAmount" ? 2 : spec.name === "totalCbm" ? 4 : 0);
      groupFooter.components.add(cell);
    }
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
      foreground: COLORS.muted,
    }),
  );
  for (const { spec, left, width } of totals) {
    const cell = textCell(sti, {
      name: `${prefix}T_${spec.name}`,
      text: `{Sum(${data.name},${key}.${spec.name})}`,
      left,
      width,
      height: ROW_HEIGHT + 0.1,
      bold: true,
      align: "RIGHT",
      fill: COLORS.headerFill,
    });
    cell.textFormat = numberFormat(sti, spec.name === "saleAmount" ? 2 : spec.name === "totalCbm" ? 4 : 0);
    footer.components.add(cell);
  }
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

  def.sections.forEach((section, i) => addSection(sti, page, section, i, usableWidth));

  return report.saveToJsonString();
}

// -------------------------------------------------------------- dashboard --

function rect(sti: Sti, r: { left: number; top: number; width: number; height: number }) {
  return new sti.System.Drawing.Rectangle(r.left, r.top, r.width, r.height);
}

function chartSeriesType(sti: Sti, kind: AnalyticsElementSpec["kind"]) {
  const T = sti.Report.Dashboard.StiChartSeriesType;
  return kind === "DOUGHNUT" ? T.Doughnut : T.ClusteredBar;
}

function buildElement(sti: Sti, spec: AnalyticsElementSpec) {
  const DC = sti.Dashboard.Components;
  const key = spec.datasetKey;

  if (spec.kind === "INDICATOR") {
    const el = new DC.Indicator.StiIndicatorElement();
    el.name = spec.name;
    el.value = new DC.Indicator.StiValueIndicatorMeter(`${spec.name}Value`, `Sum(${key}.${spec.value})`, spec.title);
    el.textFormat = numberFormat(sti, spec.decimals ?? 0);
    el.title.text = spec.title;
    el.title.visible = true;
    return el;
  }

  if (spec.kind === "TABLE") {
    const el = new DC.Table.StiTableElement();
    el.name = spec.name;
    for (const name of spec.columns ?? []) {
      const meta = columnMeta(key, name);
      const columnKey = `${spec.name}_${name}`;
      const column =
        meta.type === "number"
          ? new DC.Table.StiMeasureColumn(columnKey, `Sum(${key}.${name})`, meta.label, undefined, numberFormat(sti, spec.decimals ?? 0))
          : new DC.Table.StiDimensionColumn(columnKey, `${key}.${name}`, meta.label);
      el.columns.push(column);
    }
    el.title.text = spec.title;
    el.title.visible = true;
    return el;
  }

  const el = new DC.Chart.StiChartElement();
  el.name = spec.name;
  el.insertArgument(0, new DC.Chart.StiArgumentChartMeter(`${spec.name}Argument`, `${key}.${spec.argument}`, columnMeta(key, spec.argument!).label));
  el.insertValue(0, new DC.Chart.StiValueChartMeter(`${spec.name}Value`, `Sum(${key}.${spec.value})`, columnMeta(key, spec.value!).label, chartSeriesType(sti, spec.kind)));
  el.valueFormat = numberFormat(sti, spec.decimals ?? 0);
  // Doughnut slice labels collide on small slices; the legend and tooltips carry them.
  if (spec.kind === "DOUGHNUT") el.labels.position = sti.Report.Dashboard.StiChartLabelsPosition.None;
  el.title.text = spec.title;
  el.title.visible = true;
  return el;
}

function buildAnalyticsDashboard(sti: Sti): string {
  const report = sti.Report.StiReport.createNewDashboard();
  report.reportName = "analytics";
  report.reportAlias = "Analytics";

  ensureDataSources(sti, report, ANALYTICS_DATASET_KEYS);

  const dashboard = report.pages.getByIndex(0) as StimulsoftNamespace.Dashboard.Components.StiDashboard;
  dashboard.name = "Analytics";
  dashboard.alias = "Analytics";

  const { placements, desktopHeight, mobileHeight } = layoutAnalytics(() => true);
  dashboard.width = ANALYTICS_CANVAS.desktopWidth;
  dashboard.height = desktopHeight;
  dashboard.altSize = new sti.System.Drawing.Size(ANALYTICS_CANVAS.mobileWidth, mobileHeight);

  for (const section of ANALYTICS_SECTIONS) {
    for (const spec of section.elements) {
      const placement = placements.get(spec.name);
      if (!placement) continue;
      const el = buildElement(sti, spec);
      el.clientRectangle = rect(sti, placement.desktop);
      el.altClientRectangle = rect(sti, placement.mobile);
      dashboard.components.add(el);
    }
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
  write("dashboards/analytics.mrt.json", buildAnalyticsDashboard(sti));
  write("dashboards/blank.mrt.json", buildBlankDashboard(sti));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
