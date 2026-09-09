import ExcelJS from "exceljs";

import {
  FORECAST_IMPORT_ALIAS_MAP,
  FORECAST_IMPORT_COLUMN_LABELS,
  FORECAST_IMPORT_REQUIRED_COLUMNS,
  FORECAST_SHEET_HEADERS,
  FORECAST_SHEET_NAME,
} from "@/features/forecast/schemas/forecast-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface ForecastTemplateRow {
  period: string;
  sapCode: string;
  revenueTarget: number;
  branchName: string;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

const BRS_LAYOUT_ERROR =
  "This file is the old BRS forecast/planogram layout, not the Forecast template. Download the template (period, branch_sap_code, revenue_target). Use Planogram for shelf max and MIL days.";

const PLANOGRAM_FILE_ERROR =
  "This file looks like the Planogram template, not Forecast. Download the Forecast template (period, branch_sap_code, revenue_target). Shelf max belongs under Planogram.";

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

function readSheet(sheet: ExcelJS.Worksheet | undefined): {
  sheet: SheetRows;
  rawHeaders: string[];
} {
  if (!sheet) return { sheet: EMPTY_SHEET, rawHeaders: [] };

  const rows: SheetRows["rows"] = [];
  const columns = new Set<string>();
  const rawHeaders: string[] = [];
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToString(cell.value);
    });

    if (!keys) {
      for (const cell of cells) {
        rawHeaders.push(normalizeHeader(cell ?? ""));
      }
      keys = cells.map((cell) => FORECAST_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
      for (const key of keys) if (key) columns.add(key);
      return;
    }

    if (cells.every((cell) => !cell)) return;

    const values: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (key) values[key] = cells[index] ?? "";
    });
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
  const missingTemplateKeys =
    !columns.has("sap_code") || !columns.has("revenue_target") || !columns.has("period");

  if (!missingTemplateKeys) return false;
  if (brsHits.length >= 2) return true;
  if (ynPairs >= 2) return true;
  if (rawHeaders[0] === "period" && !columns.has("sap_code")) return true;
  return false;
}

function looksLikePlanogramTemplate(columns: Set<string>, rawHeaders: string[]): boolean {
  const hasPlanogramCols = rawHeaders.includes("sku") && rawHeaders.includes("maxqty");
  const missingForecast = !columns.has("period") || !columns.has("revenue_target");
  return hasPlanogramCols && missingForecast;
}

function assertOurTemplate(columns: Set<string>, rawHeaders: string[]): void {
  if (looksLikeBrsWideLayout(columns, rawHeaders)) {
    throw new Error(BRS_LAYOUT_ERROR);
  }
  if (looksLikePlanogramTemplate(columns, rawHeaders)) {
    throw new Error(PLANOGRAM_FILE_ERROR);
  }

  const missing = FORECAST_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    const requiredLabels = FORECAST_IMPORT_REQUIRED_COLUMNS.map(
      (col) => FORECAST_IMPORT_COLUMN_LABELS[col] ?? col,
    );
    const missingLabels = missing.map((col) => FORECAST_IMPORT_COLUMN_LABELS[col] ?? col);
    throw new Error(
      `The Forecast sheet needs columns: ${requiredLabels.join(", ")}. Missing: ${missingLabels.join(", ")}. Download the template.`,
    );
  }
}

/** Build the downloadable Forecast template (sample row when empty). */
export async function buildForecastTemplateWorkbook(
  rows: ForecastTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(FORECAST_SHEET_NAME);
  sheet.addRow([...FORECAST_SHEET_HEADERS]);
  for (const row of rows) {
    sheet.addRow([row.period, row.sapCode, row.revenueTarget, row.branchName]);
  }
  if (rows.length === 0) {
    sheet.addRow(["Dec-25", "WMK-001", 1000000, ""]);
  }
  styleHeader(sheet, [14, 18, 16, 28]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an .xlsx or .csv upload. Accepts only our Forecast template columns.
 * `branch_name` is ignored even if present.
 */
export async function readForecastImportWorkbook(file: Buffer): Promise<SheetRows> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    const rawHeaders = table.headers.map((header) => normalizeHeader(header));
    for (const header of table.headers) {
      const key = FORECAST_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    assertOurTemplate(columns, rawHeaders);

    const rows: SheetRows["rows"] = table.records.map((record) => {
      const values: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(record.values)) {
        const canonical = FORECAST_IMPORT_ALIAS_MAP[rawKey];
        if (canonical) values[canonical] = value;
      }
      return { rowNumber: record.rowNumber, values };
    });

    return { present: true, columns, rows };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find(
      (candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase(),
    );

  const named = byName(FORECAST_SHEET_NAME);
  if (named) {
    const { sheet, rawHeaders } = readSheet(named);
    assertOurTemplate(sheet.columns, rawHeaders);
    return sheet;
  }

  for (const candidate of workbook.worksheets) {
    const { sheet, rawHeaders } = readSheet(candidate);
    if (FORECAST_IMPORT_REQUIRED_COLUMNS.every((col) => sheet.columns.has(col))) {
      assertOurTemplate(sheet.columns, rawHeaders);
      return sheet;
    }
  }

  const first = readSheet(workbook.worksheets[0]);
  if (!first.sheet.present) {
    throw new Error(`Add a sheet named "${FORECAST_SHEET_NAME}" with the template columns.`);
  }
  assertOurTemplate(first.sheet.columns, first.rawHeaders);
  return first.sheet;
}
