import ExcelJS from "exceljs";

import {
  PLANOGRAM_IMPORT_ALIAS_MAP,
  PLANOGRAM_IMPORT_REQUIRED_COLUMNS,
  PLANOGRAM_SHEET_HEADERS,
  PLANOGRAM_SHEET_NAME,
} from "@/features/planogram/schemas/planogram-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface PlanogramTemplateRow {
  sapCode: string;
  sku: string;
  maxQty: number;
  milDays: number;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

const BRS_LAYOUT_ERROR =
  "This file is the old BRS forecast/planogram layout, not the Planogram template. Download the template (sap_code, sku, max_qty, mil_days). Branch revenue belongs on Planning with the Forecast template.";

/** Headers that appear on the wide Dealer 1 BRS sheet (Brand / SKU / Model / Series / SRP + Y/N pairs). */
const BRS_WIDE_HEADER_HINTS = new Set([
  "brand",
  "model",
  "modelname",
  "series",
  "srp",
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
      keys = cells.map((cell) => PLANOGRAM_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
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
    !columns.has("sap_code") || !columns.has("max_qty");

  if (brsHits.length >= 2 && missingTemplateKeys) return true;
  if (ynPairs >= 2 && missingTemplateKeys) return true;
  return false;
}

function assertOurTemplate(columns: Set<string>, rawHeaders: string[]): void {
  if (looksLikeBrsWideLayout(columns, rawHeaders)) {
    throw new Error(BRS_LAYOUT_ERROR);
  }

  const missing = PLANOGRAM_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    throw new Error(
      `The Planogram sheet needs columns: ${PLANOGRAM_IMPORT_REQUIRED_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}. Download the template.`,
    );
  }
}

/** Build the downloadable Planogram template (sample row when empty). */
export async function buildPlanogramTemplateWorkbook(
  rows: PlanogramTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(PLANOGRAM_SHEET_NAME);
  sheet.addRow([...PLANOGRAM_SHEET_HEADERS]);
  for (const row of rows) {
    sheet.addRow([row.sapCode, row.sku, row.maxQty, row.milDays]);
  }
  if (rows.length === 0) {
    sheet.addRow(["WMK-001", "100L10E", 1, 30]);
  }
  styleHeader(sheet, [14, 14, 12, 12]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an .xlsx or .csv upload. Accepts only our Planogram template columns.
 */
export async function readPlanogramImportWorkbook(file: Buffer): Promise<SheetRows> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    const rawHeaders = table.headers.map((header) => normalizeHeader(header));
    for (const header of table.headers) {
      const key = PLANOGRAM_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    assertOurTemplate(columns, rawHeaders);

    const rows: SheetRows["rows"] = table.records.map((record) => {
      const values: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(record.values)) {
        const canonical = PLANOGRAM_IMPORT_ALIAS_MAP[rawKey];
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

  const named = byName(PLANOGRAM_SHEET_NAME);
  if (named) {
    const { sheet, rawHeaders } = readSheet(named);
    assertOurTemplate(sheet.columns, rawHeaders);
    return sheet;
  }

  for (const candidate of workbook.worksheets) {
    const { sheet, rawHeaders } = readSheet(candidate);
    if (PLANOGRAM_IMPORT_REQUIRED_COLUMNS.every((col) => sheet.columns.has(col))) {
      assertOurTemplate(sheet.columns, rawHeaders);
      return sheet;
    }
  }

  const first = readSheet(workbook.worksheets[0]);
  if (!first.sheet.present) {
    throw new Error(`Add a sheet named "${PLANOGRAM_SHEET_NAME}" with the template columns.`);
  }
  assertOurTemplate(first.sheet.columns, first.rawHeaders);
  return first.sheet;
}
