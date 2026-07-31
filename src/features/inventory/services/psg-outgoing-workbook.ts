import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { normalizeHeader } from "@/lib/shared/parse-csv";

/** One Outgoing sheet row after last-wins dedupe on serialNo. */
export interface PsgOutgoingRow {
  fromWarehouseCode: string;
  toBranchSapCode: string;
  skuCode: string;
  serialNo: string;
  statusOnIsms: string;
  date: Date | null;
  sourceRowNumber: number;
}

export interface PsgOutgoingParseResult {
  rows: PsgOutgoingRow[];
  skippedEmptySerial: number;
  duplicateSerialCount: number;
  sheetName: string;
}

const OUTGOING_ALIAS_MAP: Record<string, string> = {
  date: "date",
  fromwh: "fromwh",
  towh: "towh",
  model: "model",
  serialno: "serialno",
  "serialno/": "serialno",
  statusonisms: "statusonisms",
};

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

function cellToDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value != null && "result" in value) {
    return cellToDate(value.result as ExcelJS.CellValue);
  }
  const asString = cellToString(value);
  if (!asString) return null;
  const parsed = new Date(asString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBlankOrDash(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function sheetLooksLikeOutgoing(columns: Set<string>): boolean {
  return columns.has("serialno") && columns.has("towh") && columns.has("model");
}

function readOutgoingSheetRows(sheet: ExcelJS.Worksheet): {
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string>; date: Date | null }[];
} {
  const rows: { rowNumber: number; values: Record<string, string>; date: Date | null }[] = [];
  const columns = new Set<string>();
  let keys: (string | null)[] | null = null;
  let dateColIndex: number | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    const rawByCol: ExcelJS.CellValue[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToString(cell.value);
      rawByCol[columnNumber - 1] = cell.value;
    });

    if (!keys) {
      keys = cells.map((cell) => OUTGOING_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
      for (const key of keys) if (key) columns.add(key);
      dateColIndex = keys.findIndex((key) => key === "date");
      return;
    }

    if (cells.every((cell) => !cell)) return;

    const values: Record<string, string> = {};
    keys.forEach((key, index) => {
      if (key) values[key] = cells[index] ?? "";
    });

    const date =
      dateColIndex != null && dateColIndex >= 0
        ? cellToDate(rawByCol[dateColIndex] ?? null)
        : null;

    rows.push({ rowNumber, values, date });
  });

  return { columns, rows };
}

function rowsToOutgoingResult(
  sheetName: string,
  sheetRows: { rowNumber: number; values: Record<string, string>; date: Date | null }[],
): PsgOutgoingParseResult {
  const bySerial = new Map<string, PsgOutgoingRow>();
  let skippedEmptySerial = 0;
  let duplicateSerialCount = 0;

  for (const row of sheetRows) {
    const serialNo = (row.values.serialno ?? "").trim();
    if (isBlankOrDash(serialNo)) {
      skippedEmptySerial += 1;
      continue;
    }

    const fromWarehouseCode = (row.values.fromwh ?? "").trim() || "FWH14P1F";
    const toBranchSapCode = (row.values.towh ?? "").trim();
    const skuCode = (row.values.model ?? "").trim();
    const statusOnIsms = (row.values.statusonisms ?? "").trim().toLowerCase() || "active";

    const key = serialNo.toLowerCase();
    if (bySerial.has(key)) duplicateSerialCount += 1;

    bySerial.set(key, {
      fromWarehouseCode,
      toBranchSapCode,
      skuCode,
      serialNo,
      statusOnIsms,
      date: row.date,
      sourceRowNumber: row.rowNumber,
    });
  }

  return {
    rows: [...bySerial.values()],
    skippedEmptySerial,
    duplicateSerialCount,
    sheetName,
  };
}

/** Default path to the PSG workbook under docs/. */
export function defaultPsgWorkbookPath(): string {
  return path.join(process.cwd(), "docs", "07.29.26 - PSG ok.xlsx");
}

/** Parse the Outgoing sheet from a workbook buffer. Duplicate SERIALNO/: last non-empty row wins. */
export async function parsePsgOutgoingWorkbook(buffer: Buffer): Promise<PsgOutgoingParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase());

  const outgoing = byName("Outgoing");
  if (outgoing) {
    const { rows } = readOutgoingSheetRows(outgoing);
    return rowsToOutgoingResult(outgoing.name, rows);
  }

  for (const sheet of workbook.worksheets) {
    const { columns, rows } = readOutgoingSheetRows(sheet);
    if (sheetLooksLikeOutgoing(columns)) {
      return rowsToOutgoingResult(sheet.name, rows);
    }
  }

  return { rows: [], skippedEmptySerial: 0, duplicateSerialCount: 0, sheetName: "" };
}

/** Read the on-disk PSG workbook and parse the Outgoing sheet. */
export async function parsePsgOutgoingWorkbookFromPath(
  workbookPath?: string,
): Promise<PsgOutgoingParseResult> {
  const resolved = workbookPath ?? defaultPsgWorkbookPath();
  if (!fs.existsSync(resolved)) {
    throw new Error(`PSG workbook not found at ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  return parsePsgOutgoingWorkbook(buffer);
}
