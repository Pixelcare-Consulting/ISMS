import ExcelJS from "exceljs";

import {
  formatPeriodLabelFromDate,
  normalizePeriodLabel,
} from "@/features/demand-planning/lib/planning-period-dates";
import {
  FOCUS_SHEET_NAME,
  FORECAST_IMPORT_ALIAS_MAP,
  FORECAST_IMPORT_REQUIRED_COLUMNS,
  FORECAST_SHEET_NAME,
  SFE_IMPORT_ALIAS_MAP,
  SFE_IMPORT_COLUMN_LABELS,
  SFE_IMPORT_REQUIRED_COLUMNS,
  SFE_SHEET_HEADERS,
  SFE_SHEET_NAME,
} from "@/features/forecast/schemas/forecast-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface SfeTemplateRow {
  period: string;
  sapCode: string;
  sku: string;
  forecastQty: number;
}

export interface ForecastImportSheets {
  sfe: SheetRows;
  /** True when a legacy Forecast sheet was present and ignored. */
  ignoredForecastSheet: boolean;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

const BRS_LAYOUT_ERROR =
  "This file is the old BRS forecast/planogram layout, not the Forecast template. Download the template (SFE: period, branch_sap_code, sku, forecast_qty). Use Planogram for shelf max.";

const PLANOGRAM_FILE_ERROR =
  "This file looks like the Planogram template, not Forecast. Download the Forecast template. Shelf max belongs under Planogram.";

const FOCUS_SHEET_ERROR =
  `A "${FOCUS_SHEET_NAME}" sheet is not supported. Remove it and use the SFE sheet only (period, branch_sap_code, sku, forecast_qty).`;

/** Headers that appear on the wide Dealer 1 BRS sheet (Brand / SKU / Model / Series / SRP + Y/N pairs). */
const BRS_WIDE_HEADER_HINTS = new Set([
  "brand",
  "model",
  "modelname",
  "series",
  "srp",
  "sku",
  "target",
  "forecast",
  "revenue",
]);

const MANILA_TZ = "Asia/Manila";
const LEGACY_PERIOD_LABEL_RE = /^[A-Za-z]{3}[-/\s]\d{2,4}$/;
const YYYYMMDD_RE = /^\d{8}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && value.result != null) return cellToString(value.result);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return "";
}

function looksLikePeriodLabel(text: string): boolean {
  const trimmed = text.trim();
  return (
    YYYYMMDD_RE.test(trimmed) ||
    LEGACY_PERIOD_LABEL_RE.test(trimmed) ||
    /^\d{4}[-/]\d{1,2}$/.test(trimmed) ||
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)
  );
}

/** Convert a Date to canonical MMM-YY using Asia/Manila calendar month. */
function formatManilaPeriodLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) return "";
  return formatPeriodLabelFromDate(
    new Date(Date.UTC(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, 1)),
  );
}

function asCanonicalPeriodLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return normalizePeriodLabel(trimmed) ?? trimmed;
}

/** Period column: normalize to MMM-YY; convert Excel Date / ISO via Asia/Manila. */
function periodValueToLabel(value: ExcelJS.CellValue, displayedText?: string): string {
  const displayed = displayedText?.trim() ?? "";
  if (displayed && looksLikePeriodLabel(displayed)) {
    return asCanonicalPeriodLabel(displayed);
  }

  if (value instanceof Date) {
    return formatManilaPeriodLabel(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (looksLikePeriodLabel(trimmed)) return asCanonicalPeriodLabel(trimmed);
    if (ISO_DATE_RE.test(trimmed)) {
      const labeled = formatManilaPeriodLabel(new Date(trimmed));
      if (labeled) return labeled;
    }
    return asCanonicalPeriodLabel(trimmed) || trimmed;
  }

  if (typeof value === "object" && value) {
    if ("result" in value && value.result != null) {
      return periodValueToLabel(value.result, displayed);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return periodValueToLabel(value.richText.map((part) => part.text).join(""), displayed);
    }
    if ("text" in value && typeof value.text === "string") {
      return periodValueToLabel(value.text, displayed);
    }
  }

  return asCanonicalPeriodLabel(cellToString(value)) || cellToString(value);
}

function periodCellToLabel(cell: ExcelJS.Cell): string {
  return periodValueToLabel(cell.value, cell.text);
}

function readSheet(
  sheet: ExcelJS.Worksheet | undefined,
  aliasMap: Record<string, string>,
): {
  sheet: SheetRows;
  rawHeaders: string[];
} {
  if (!sheet) return { sheet: EMPTY_SHEET, rawHeaders: [] };

  const rows: SheetRows["rows"] = [];
  const columns = new Set<string>();
  const rawHeaders: string[] = [];
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const colCount = Math.max(row.cellCount, keys?.length ?? 0);
    const cells: ExcelJS.Cell[] = [];
    for (let col = 1; col <= colCount; col += 1) {
      cells.push(row.getCell(col));
    }

    if (!keys) {
      for (const cell of cells) {
        rawHeaders.push(normalizeHeader(cellToString(cell.value)));
      }
      keys = cells.map(
        (cell) => aliasMap[normalizeHeader(cellToString(cell.value))] ?? null,
      );
      for (const key of keys) if (key) columns.add(key);
      return;
    }

    const values: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (!key) return;
      const cell = cells[index];
      values[key] = !cell
        ? ""
        : key === "period"
          ? periodCellToLabel(cell)
          : cellToString(cell.value);
    });

    if (Object.values(values).every((cell) => !cell)) return;
    rows.push({ rowNumber, values });
  });

  return { sheet: { present: true, columns, rows }, rawHeaders };
}

function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function styleHeader(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function looksLikeBrsWideLayout(columns: Set<string>, rawHeaders: string[]): boolean {
  const brsHits = rawHeaders.filter((header) => BRS_WIDE_HEADER_HINTS.has(header));
  const ynPairs = rawHeaders.filter((header) => header === "y" || header === "n").length;
  const hasQuota = columns.has("sap_code") && columns.has("revenue_target") && columns.has("period");
  const hasSfe =
    columns.has("sap_code") && columns.has("sku") && columns.has("forecast_qty") && columns.has("period");

  if (hasQuota || hasSfe) return false;
  if (brsHits.length >= 2) return true;
  if (ynPairs >= 2) return true;
  if (rawHeaders[0] === "period" && !columns.has("sap_code")) return true;
  return false;
}

function looksLikePlanogramTemplate(columns: Set<string>, rawHeaders: string[]): boolean {
  const hasPlanogramCols = rawHeaders.includes("sku") && rawHeaders.includes("maxqty");
  const missingForecast =
    !columns.has("period") || (!columns.has("revenue_target") && !columns.has("forecast_qty"));
  return hasPlanogramCols && missingForecast;
}

function missingRequired(
  columns: Set<string>,
  required: readonly string[],
  labels: Record<string, string>,
  sheetName: string,
): string | null {
  const missing = required.filter((col) => !columns.has(col));
  if (missing.length === 0) return null;
  const requiredLabels = required.map((col) => labels[col] ?? col);
  const missingLabels = missing.map((col) => labels[col] ?? col);
  return `The ${sheetName} sheet needs columns: ${requiredLabels.join(", ")}. Missing: ${missingLabels.join(", ")}. Download the template.`;
}

function assertNotForeignLayout(columns: Set<string>, rawHeaders: string[]): void {
  if (looksLikeBrsWideLayout(columns, rawHeaders)) {
    throw new Error(BRS_LAYOUT_ERROR);
  }
  if (looksLikePlanogramTemplate(columns, rawHeaders)) {
    throw new Error(PLANOGRAM_FILE_ERROR);
  }
}

function isSfeColumns(columns: Set<string>): boolean {
  return SFE_IMPORT_REQUIRED_COLUMNS.every((col) => columns.has(col));
}

function isQuotaColumns(columns: Set<string>): boolean {
  return FORECAST_IMPORT_REQUIRED_COLUMNS.every((col) => columns.has(col));
}

function csvSheetFromTable(
  table: ReturnType<typeof parseCsvTable>,
  aliasMap: Record<string, string>,
): SheetRows {
  const columns = new Set<string>();
  for (const header of table.headers) {
    const key = aliasMap[normalizeHeader(header)];
    if (key) columns.add(key);
  }
  const rows: SheetRows["rows"] = table.records.map((record) => {
    const values: Record<string, string> = {};
    for (const [rawKey, value] of Object.entries(record.values)) {
      const canonical = aliasMap[rawKey];
      if (canonical) {
        values[canonical] = canonical === "period" ? periodValueToLabel(value) : value;
      }
    }
    return { rowNumber: record.rowNumber, values };
  });
  return { present: true, columns, rows };
}

function worksheetByName(workbook: ExcelJS.Workbook, name: string) {
  return workbook.worksheets.find(
    (candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase(),
  );
}

function assertNoFocusSheet(workbook: ExcelJS.Workbook): void {
  if (worksheetByName(workbook, FOCUS_SHEET_NAME)) {
    throw new Error(FOCUS_SHEET_ERROR);
  }
}

/** Build the downloadable Forecast template (SFE sheet only). */
export async function buildForecastTemplateWorkbook(
  sfeRows: SfeTemplateRow[] = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sfeSheet = workbook.addWorksheet(SFE_SHEET_NAME);
  sfeSheet.addRow([...SFE_SHEET_HEADERS]);
  sfeSheet.getColumn(1).numFmt = "@";
  const sfeData =
    sfeRows.length > 0
      ? sfeRows
      : [{ period: "Dec-25", sapCode: "WMK-001", sku: "32STW101", forecastQty: 20 }];
  for (const row of sfeData) {
    const dataRow = sfeSheet.addRow([String(row.period), row.sapCode, row.sku, row.forecastQty]);
    dataRow.getCell(1).value = String(row.period);
    dataRow.getCell(1).numFmt = "@";
  }
  styleHeader(sfeSheet, [14, 18, 16, 14]);
  sfeSheet.getColumn(1).numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an .xlsx or .csv upload. Requires the SFE sheet (SKU forecast).
 * A legacy Forecast sheet is ignored. A Focus sheet is rejected.
 */
export async function readForecastImportWorkbook(file: Buffer): Promise<ForecastImportSheets> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const rawHeaders = table.headers.map((header) => normalizeHeader(header));
    const sfeProbe = csvSheetFromTable(table, SFE_IMPORT_ALIAS_MAP);
    const quotaProbe = csvSheetFromTable(table, FORECAST_IMPORT_ALIAS_MAP);
    assertNotForeignLayout(
      new Set([...sfeProbe.columns, ...quotaProbe.columns]),
      rawHeaders,
    );

    if (isSfeColumns(sfeProbe.columns)) {
      return {
        sfe: sfeProbe,
        ignoredForecastSheet: isQuotaColumns(quotaProbe.columns),
      };
    }
    if (isQuotaColumns(quotaProbe.columns)) {
      throw new Error(
        `CSV must use the SFE columns (${SFE_IMPORT_REQUIRED_COLUMNS.map((col) => SFE_IMPORT_COLUMN_LABELS[col]).join(", ")}). Target Quota is calculated from forecast qty × SRP — do not upload a Forecast quota file.`,
      );
    }

    const sfeError = missingRequired(
      sfeProbe.columns,
      SFE_IMPORT_REQUIRED_COLUMNS,
      SFE_IMPORT_COLUMN_LABELS,
      SFE_SHEET_NAME,
    );
    throw new Error(
      sfeError ??
        `Add SFE columns (${SFE_IMPORT_REQUIRED_COLUMNS.map((col) => SFE_IMPORT_COLUMN_LABELS[col]).join(", ")}). Download the template.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);
  assertNoFocusSheet(workbook);

  const namedSfe = worksheetByName(workbook, SFE_SHEET_NAME);
  const namedQuota = worksheetByName(workbook, FORECAST_SHEET_NAME);
  const ignoredForecastSheet = Boolean(namedQuota);

  let sfe = EMPTY_SHEET;

  if (namedSfe) {
    const parsed = readSheet(namedSfe, SFE_IMPORT_ALIAS_MAP);
    assertNotForeignLayout(parsed.sheet.columns, parsed.rawHeaders);
    const error = missingRequired(
      parsed.sheet.columns,
      SFE_IMPORT_REQUIRED_COLUMNS,
      SFE_IMPORT_COLUMN_LABELS,
      SFE_SHEET_NAME,
    );
    if (error) throw new Error(error);
    sfe = parsed.sheet;
  }

  if (sfe.present) {
    return { sfe, ignoredForecastSheet };
  }

  for (const candidate of workbook.worksheets) {
    if (candidate.name.trim().toLowerCase() === FORECAST_SHEET_NAME.toLowerCase()) continue;
    const sfeParsed = readSheet(candidate, SFE_IMPORT_ALIAS_MAP);
    if (isSfeColumns(sfeParsed.sheet.columns)) {
      assertNotForeignLayout(sfeParsed.sheet.columns, sfeParsed.rawHeaders);
      sfe = sfeParsed.sheet;
      break;
    }
  }

  if (sfe.present) {
    return { sfe, ignoredForecastSheet };
  }

  if (ignoredForecastSheet) {
    throw new Error(
      `Add a sheet named "${SFE_SHEET_NAME}" (period, branch_sap_code, sku, forecast_qty). The "${FORECAST_SHEET_NAME}" sheet is no longer used — Target Quota is calculated from SFE × price list.`,
    );
  }

  const first = readSheet(workbook.worksheets[0], SFE_IMPORT_ALIAS_MAP);
  if (!first.sheet.present) {
    throw new Error(
      `Add a sheet named "${SFE_SHEET_NAME}" (period, branch_sap_code, sku, forecast_qty).`,
    );
  }
  assertNotForeignLayout(first.sheet.columns, first.rawHeaders);
  const error = missingRequired(
    first.sheet.columns,
    SFE_IMPORT_REQUIRED_COLUMNS,
    SFE_IMPORT_COLUMN_LABELS,
    SFE_SHEET_NAME,
  );
  throw new Error(
    error ?? `Add a sheet named "${SFE_SHEET_NAME}" with the template columns.`,
  );
}
