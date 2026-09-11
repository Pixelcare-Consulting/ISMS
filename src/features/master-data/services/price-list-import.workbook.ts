import ExcelJS from "exceljs";

import {
  PRICE_LIST_IMPORT_ALIAS_MAP,
  PRICE_LIST_IMPORT_REQUIRED_COLUMNS,
  PRICE_LIST_SHEET_HEADERS,
  PRICE_LIST_SHEET_NAME,
} from "@/features/master-data/schemas/price-list-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface PriceListTemplateRow {
  sku: string;
  modelName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  packageTypeName: string;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

const DATE_COLUMNS = new Set(["period_start", "period_end"]);

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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ymd(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Calendar day as YYYY-MM-DD, preferring UTC midnight when the instant is already UTC. */
function calendarYmdFromDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return "";
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    return value.toISOString().slice(0, 10);
  }
  return ymd(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Excel serial days since 1899-12-30 → YYYY-MM-DD (UTC). */
function excelSerialToYmd(serial: number): string {
  const wholeDays = Math.trunc(serial);
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + wholeDays * 86_400_000).toISOString().slice(0, 10);
}

function dateValueToYmd(value: ExcelJS.CellValue, displayedText?: string): string {
  const displayed = displayedText?.trim() ?? "";
  const displayedYmd = displayed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (displayedYmd) return displayedYmd[0];

  if (value instanceof Date) return calendarYmdFromDate(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) return excelSerialToYmd(value);
    return String(value).trim();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    return trimmed;
  }
  if (typeof value === "object" && value) {
    if ("result" in value && value.result != null) {
      return dateValueToYmd(value.result, displayed);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return dateValueToYmd(value.richText.map((part) => part.text).join(""), displayed);
    }
    if ("text" in value && typeof value.text === "string") {
      return dateValueToYmd(value.text, displayed);
    }
  }
  return cellToString(value);
}

function cellToCanonical(key: string | null, cell: ExcelJS.Cell): string {
  if (key && DATE_COLUMNS.has(key)) {
    return dateValueToYmd(cell.value, cell.text);
  }
  return cellToString(cell.value);
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
    if (!keys) {
      const headerCells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        headerCells[columnNumber - 1] = cellToString(cell.value);
      });
      for (const cell of headerCells) {
        rawHeaders.push(normalizeHeader(cell ?? ""));
      }
      keys = headerCells.map(
        (cell) => PRICE_LIST_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null,
      );
      for (const key of keys) if (key) columns.add(key);
      return;
    }

    const values: Record<string, string> = {};
    let anyValue = false;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const key = keys![columnNumber - 1] ?? null;
      if (!key) return;
      const text = cellToCanonical(key, cell);
      values[key] = text;
      if (text) anyValue = true;
    });
    if (!anyValue) return;
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

function assertOurTemplate(columns: Set<string>): void {
  const missing = PRICE_LIST_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    throw new Error(
      `The Price lists sheet needs columns: ${PRICE_LIST_IMPORT_REQUIRED_COLUMNS.join(", ")}. Missing: ${missing.join(", ")}. Download the template.`,
    );
  }
}

function mapCsvRecord(record: {
  rowNumber: number;
  values: Record<string, string>;
}): { rowNumber: number; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(record.values)) {
    const canonical = PRICE_LIST_IMPORT_ALIAS_MAP[rawKey];
    if (canonical) values[canonical] = value;
  }
  return { rowNumber: record.rowNumber, values };
}

/** Build the downloadable Price lists template (sample row when empty). */
export async function buildPriceListTemplateWorkbook(
  rows: PriceListTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(PRICE_LIST_SHEET_NAME);
  sheet.addRow([...PRICE_LIST_SHEET_HEADERS]);
  for (const row of rows) {
    sheet.addRow([
      row.sku,
      row.modelName,
      row.amount,
      row.periodStart,
      row.periodEnd,
      row.packageTypeName,
    ]);
  }
  if (rows.length === 0) {
    sheet.addRow(["100L10E", 'HISENSE 100" 4K LASER TV 100L10E', 129990, "2026-01-01", "2026-12-31", ""]);
  }
  styleHeader(sheet, [14, 40, 12, 14, 14, 16]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Read an .xlsx or .csv upload. Accepts only our Price lists template columns.
 */
export async function readPriceListImportWorkbook(file: Buffer): Promise<SheetRows> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    for (const header of table.headers) {
      const key = PRICE_LIST_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    assertOurTemplate(columns);

    return {
      present: true,
      columns,
      rows: table.records.map(mapCsvRecord),
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find(
      (candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase(),
    );

  const named = byName(PRICE_LIST_SHEET_NAME);
  if (named) {
    const { sheet } = readSheet(named);
    assertOurTemplate(sheet.columns);
    return sheet;
  }

  for (const candidate of workbook.worksheets) {
    const { sheet } = readSheet(candidate);
    if (PRICE_LIST_IMPORT_REQUIRED_COLUMNS.every((col) => sheet.columns.has(col))) {
      assertOurTemplate(sheet.columns);
      return sheet;
    }
  }

  const first = readSheet(workbook.worksheets[0]);
  if (!first.sheet.present) {
    throw new Error(`Add a sheet named "${PRICE_LIST_SHEET_NAME}" with the template columns.`);
  }
  assertOurTemplate(first.sheet.columns);
  return first.sheet;
}
