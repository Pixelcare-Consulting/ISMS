import ExcelJS from "exceljs";

import {
  MODEL_IMPORT_ALIAS_MAP,
  MODEL_IMPORT_REQUIRED_COLUMNS,
  MODEL_SHEET_HEADERS,
  MODEL_SHEET_NAME,
} from "@/features/master-data/schemas/model-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface ModelTemplateRow {
  sku: string;
  name: string;
  brand: string;
  series: string;
  feature: string;
  resolution: string;
  actualSize: string;
  status: string;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

const FOREIGN_HEADER_HINTS = new Set([
  "itemno",
  "itemname",
  "groupcode",
  "groupname",
  "onhand",
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
      keys = cells.map((cell) => MODEL_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
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

function assertOurTemplate(columns: Set<string>, rawHeaders: string[]): void {
  const foreignHits = rawHeaders.filter((header) => FOREIGN_HEADER_HINTS.has(header));
  if (foreignHits.length > 0 && !columns.has("sku")) {
    throw new Error(
      "This file is not the Models import template. Download the template and use those columns (sku, name, brand, series).",
    );
  }
  if (foreignHits.length > 0 && !MODEL_IMPORT_REQUIRED_COLUMNS.every((col) => columns.has(col))) {
    throw new Error(
      "This file is not the Models import template. Download the template and use those columns (sku, name, brand, series).",
    );
  }

  const missing = MODEL_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    throw new Error(
      `The Models sheet needs columns: ${MODEL_IMPORT_REQUIRED_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}. Download the template.`,
    );
  }
}

/** Build the downloadable Models template (sample row when empty). */
export async function buildModelTemplateWorkbook(
  models: ModelTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(MODEL_SHEET_NAME);
  sheet.addRow([...MODEL_SHEET_HEADERS]);
  for (const model of models) {
    sheet.addRow([
      model.sku,
      model.name,
      model.brand,
      model.series,
      model.feature,
      model.resolution,
      model.actualSize,
      model.status,
    ]);
  }
  if (models.length === 0) {
    sheet.addRow([
      "100L10E",
      'HISENSE 100" 4K LASER TV 100L10E',
      "HISENSE",
      "TR-HSDLPT",
      "",
      "",
      "",
      "active",
    ]);
  }
  styleHeader(sheet, [14, 40, 14, 16, 14, 14, 14, 10]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an .xlsx or .csv upload. Accepts only our Models template columns.
 */
export async function readModelImportWorkbook(file: Buffer): Promise<SheetRows> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    const rawHeaders = table.headers.map((header) => normalizeHeader(header));
    for (const header of table.headers) {
      const key = MODEL_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    assertOurTemplate(columns, rawHeaders);

    const rows: SheetRows["rows"] = table.records.map((record) => {
      const values: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(record.values)) {
        const canonical = MODEL_IMPORT_ALIAS_MAP[rawKey];
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

  const named = byName(MODEL_SHEET_NAME);
  if (named) {
    const { sheet, rawHeaders } = readSheet(named);
    assertOurTemplate(sheet.columns, rawHeaders);
    return sheet;
  }

  // Prefer first sheet that already has our required columns; otherwise first sheet + strict error.
  for (const candidate of workbook.worksheets) {
    const { sheet, rawHeaders } = readSheet(candidate);
    if (MODEL_IMPORT_REQUIRED_COLUMNS.every((col) => sheet.columns.has(col))) {
      assertOurTemplate(sheet.columns, rawHeaders);
      return sheet;
    }
  }

  const first = readSheet(workbook.worksheets[0]);
  if (!first.sheet.present) {
    throw new Error(`Add a sheet named "${MODEL_SHEET_NAME}" with the template columns.`);
  }
  assertOurTemplate(first.sheet.columns, first.rawHeaders);
  return first.sheet;
}
