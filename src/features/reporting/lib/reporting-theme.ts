import type { Stimulsoft } from "stimulsoft-dashboards-js-react/stimulsoft.reports";

import type { StimulsoftApi } from "@/features/reporting/lib/stimulsoft-client";

type StiReport = Stimulsoft.Report.StiReport;

/**
 * ISMS look for Stimulsoft output: one source for the template generator
 * (reports + Analytics) and the runtime (custom dashboards, designer).
 *
 * Colors mirror the light tokens in src/app/globals.css (the app has no
 * dark mode toggle). Stimulsoft needs concrete RGB, so keep these in sync
 * with that file when the brand changes.
 */
export const ISMS_THEME = {
  /** next/font registers the family under this exact name. */
  fontFamily: "Geist",
  colors: {
    background: [245, 246, 248], // --background 220 20% 97%
    card: [255, 255, 255], // --card
    foreground: [23, 23, 28], // --foreground 240 10% 10%
    mutedForeground: [113, 113, 122], // --muted-foreground 240 4% 46%
    muted: [238, 240, 243], // --muted 220 14% 94%
    border: [228, 230, 234], // --border 220 13% 91%
    primary: [42, 157, 146], // --primary 174 58% 39%
    stripe: [247, 248, 254], // --table-stripe 230 60% 98%
  },
  /** Single-series charts (bars): the system's indigo blue (sidebar/accent hue 234°). */
  chartBlue: "#3644c9",
  /**
   * Multi-category charts (doughnut slices): shades of the same blue,
   * alternating dark/light so neighbours stay apart. Checked with the dataviz
   * palette validator: every adjacent pair, including last→first, passes
   * normal-vision (ΔE ≥ 19) and CVD separation. A single-hue palette can't
   * pass the lightness/chroma band, so legends must stay on as the identity cue.
   */
  series: ["#2d39a9", "#7680db", "#1c2469", "#5662d2", "#242e89", "#969ee3", "#3644c9", "#b6bcec"],
  /** --radius (0.625rem) in px. */
  radius: 10,
  /** 8px spacing scale: element padding and gaps. */
  spacing: 8,
} as const;

export const ISMS_STYLE_NAME = "ISMS";

type Rgb = readonly [number, number, number];

function color(api: StimulsoftApi, rgb: Rgb) {
  return api.System.Drawing.Color.fromArgb(255, rgb[0], rgb[1], rgb[2]);
}

function hexColor(api: StimulsoftApi, hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return api.System.Drawing.Color.fromArgb(255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function font(api: StimulsoftApi, size: number, bold = false) {
  return new api.System.Drawing.Font(
    ISMS_THEME.fontFamily,
    size,
    bold ? api.System.Drawing.FontStyle.Bold : api.System.Drawing.FontStyle.Regular,
  );
}

function solid(api: StimulsoftApi, rgb: Rgb) {
  return new api.Base.Drawing.StiSolidBrush(color(api, rgb));
}

/** Builds (or replaces) the ISMS chart, indicator and table styles on a report. */
function registerIsmsStyles(api: StimulsoftApi, report: StiReport): void {
  const C = ISMS_THEME.colors;
  for (const existing of [...report.styles.toList()]) {
    if (existing.name === ISMS_STYLE_NAME) report.styles.remove(existing);
  }

  const chart = new api.Report.Styles.StiChartStyle(ISMS_STYLE_NAME);
  chart.brush = solid(api, C.card);
  chart.chartAreaBrush = solid(api, C.card);
  chart.chartAreaBorderColor = color(api, C.card);
  chart.styleColors = ISMS_THEME.series.map((hex) => hexColor(api, hex));
  chart.basicStyleColor = hexColor(api, ISMS_THEME.chartBlue);
  chart.seriesLighting = false;
  chart.seriesShowShadow = false;
  chart.seriesShowBorder = false;
  chart.seriesLabelsColor = color(api, C.foreground);
  chart.legendBrush = solid(api, C.card);
  chart.legendLabelsColor = color(api, C.mutedForeground);
  chart.legendBorderColor = color(api, C.card);
  chart.axisTitleColor = color(api, C.mutedForeground);
  chart.axisLabelsColor = color(api, C.mutedForeground);
  chart.axisLineColor = color(api, C.border);
  chart.gridLinesHorColor = color(api, C.border);
  chart.gridLinesVertColor = color(api, C.border);
  chart.toolTipBrush = solid(api, C.foreground);
  chart.toolTipTextBrush = solid(api, C.card);
  report.styles.add(chart);

  const indicator = new api.Report.StiIndicatorStyle(ISMS_STYLE_NAME);
  indicator.backColor = color(api, C.card);
  indicator.foreColor = color(api, C.foreground);
  indicator.glyphColor = hexColor(api, ISMS_THEME.chartBlue);
  indicator.titleBackColor = color(api, C.card);
  indicator.titleForeColor = color(api, C.mutedForeground);
  indicator.allowUseFont = true;
  indicator.font = font(api, 28, true);
  indicator.allowUseTitle = true;
  indicator.titleFont = font(api, 11);
  report.styles.add(indicator);

  const table = new api.Report.StiTableStyle(ISMS_STYLE_NAME);
  table.backColor = color(api, C.card);
  table.headerColor = color(api, C.muted);
  table.headerForeground = color(api, C.foreground);
  table.dataColor = color(api, C.card);
  table.dataForeground = color(api, C.foreground);
  table.alternatingDataColor = color(api, C.stripe);
  table.alternatingDataForeground = color(api, C.foreground);
  table.selectedDataColor = color(api, C.muted);
  table.selectedDataForeground = color(api, C.foreground);
  table.footerColor = color(api, C.muted);
  table.footerForeground = color(api, C.foreground);
  table.gridColor = color(api, C.border);
  table.allowUseFont = true;
  table.font = font(api, 10);
  table.allowUseTitle = true;
  table.titleBackColor = color(api, C.card);
  table.titleForeColor = color(api, C.mutedForeground);
  table.titleFont = font(api, 11);
  report.styles.add(table);
}

type ThemableElement = Stimulsoft.Dashboard.Components.StiElement & {
  style?: number;
  customStyleName?: string;
  title?: { font: unknown; foreColor: unknown; backColor: unknown };
  cornerRadius?: unknown;
};

/**
 * Applies the ISMS look to every dashboard page. Elements still on the
 * default ("Auto") style switch to the ISMS custom style; anything an author
 * styled explicitly in the designer is left alone.
 */
export function applyIsmsDashboardTheme(api: StimulsoftApi, report: StiReport): void {
  registerIsmsStyles(api, report);
  const Ident = api.Report.Dashboard.StiElementStyleIdent;
  const C = ISMS_THEME.colors;

  for (const page of report.pages.toList()) {
    if (!(page instanceof api.Dashboard.Components.StiDashboard)) continue;
    page.backColor = color(api, C.background);
    for (const component of page.components.toList()) {
      const element = component as ThemableElement;
      if (element.style === undefined) continue;
      // Ours = still on the default style, or tagged ISMS by an earlier pass.
      const isOurs = element.style === Ident.Auto || element.customStyleName === ISMS_STYLE_NAME;
      if (!isOurs) continue;
      element.customStyleName = ISMS_STYLE_NAME;
      if (element.cornerRadius !== undefined) {
        element.cornerRadius = new api.Base.Drawing.StiCornerRadius(
          ISMS_THEME.radius,
          ISMS_THEME.radius,
          ISMS_THEME.radius,
          ISMS_THEME.radius,
        );
      }
      if (element instanceof api.Dashboard.Components.Chart.StiChartElement) {
        // Stimulsoft's Custom chart style brings its own yellow/brown chrome;
        // the built-in Blue chrome is clean and our series colors still apply.
        element.style = Ident.Blue;
        themeChart(api, element);
        continue;
      }
      element.style = Ident.Custom;
      if (element.title) element.title.font = font(api, 11, true);
    }
  }
}

/** Series colors live on the element: one blue for bars, the ramp for slices. */
function themeChart(api: StimulsoftApi, chart: Stimulsoft.Dashboard.Components.Chart.StiChartElement): void {
  const isPie = chart.values.some((meter) => /Doughnut|Pie/.test(String(api.Report.Dashboard.StiChartSeriesType[meter.seriesType])));
  const colors = isPie ? ISMS_THEME.series : [ISMS_THEME.chartBlue];
  chart.seriesColors = colors.map((hex) => hexColor(api, hex));
}

/** Viewer/designer chrome themes closest to the teal primary. */
export function ismsViewerTheme(api: StimulsoftApi) {
  return api.Viewer.StiViewerTheme.Office2022WhiteTeal;
}

export function ismsDesignerTheme(api: StimulsoftApi) {
  return api.Designer.StiDesignerTheme.Office2022WhiteTeal;
}
