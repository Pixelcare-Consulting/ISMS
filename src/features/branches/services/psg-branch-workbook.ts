import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { normalizeHeader } from "@/lib/shared/parse-csv";

/** One coded PSG ISMS branch row after last-wins dedupe on sapCode. */
export interface PsgBranchRow {
  name: string;
  sapCode: string;
  areaName: string | null;
  status: "active" | "inactive";
  devantQuota: number | null;
  hisenseQuota: number | null;
  sourceRowNumber: number;
}

export interface PsgParseResult {
  rows: PsgBranchRow[];
  skippedEmptyCode: number;
  duplicateSapCodeCount: number;
  sheetName: string;
}

const PSG_ALIAS_MAP: Record<string, string> = {
  branchname: "branchname",
  name: "branchname",
  branchcode: "sapcode",
  sapcode: "sapcode",
  branchsapcode: "sapcode",
  area: "area",
  status: "status",
  devantquota: "devantquota",
  hisenseblquota: "hisenseblquota",
  hisensewlquota: "hisensewlquota",
  hisensequota: "hisensequota",
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

function isBlankOrDash(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function parseQuota(raw: string): number | null {
  if (isBlankOrDash(raw)) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStatus(raw: string): "active" | "inactive" {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "inactive" || normalized === "in-active" || normalized === "disabled") {
    return "inactive";
  }
  return "active";
}

function resolveHisenseQuota(bl: number | null, wl: number | null, combined: number | null): number | null {
  if (combined != null) return combined;
  if (bl != null && wl != null) return bl + wl;
  if (bl != null) return bl;
  if (wl != null) return wl;
  return null;
}

function sheetLooksLikePsg(columns: Set<string>): boolean {
  return columns.has("sapcode") && (columns.has("area") || columns.has("devantquota") || columns.has("status"));
}

function readSheetRows(sheet: ExcelJS.Worksheet): {
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
} {
  const rows: { rowNumber: number; values: Record<string, string> }[] = [];
  const columns = new Set<string>();
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToString(cell.value);
    });

    if (!keys) {
      keys = cells.map((cell) => PSG_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
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

  return { columns, rows };
}

function rowsToPsgResult(
  sheetName: string,
  sheetRows: { rowNumber: number; values: Record<string, string> }[],
): PsgParseResult {
  const bySap = new Map<string, PsgBranchRow>();
  let skippedEmptyCode = 0;
  let duplicateSapCodeCount = 0;

  for (const row of sheetRows) {
    const sapCode = (row.values.sapcode ?? "").trim();
    if (isBlankOrDash(sapCode)) {
      skippedEmptyCode += 1;
      continue;
    }

    const name = (row.values.branchname ?? "").trim() || sapCode;
    const areaRaw = (row.values.area ?? "").trim();
    const areaName = isBlankOrDash(areaRaw) ? null : areaRaw;
    const devantQuota = parseQuota(row.values.devantquota ?? "");
    const hisenseQuota = resolveHisenseQuota(
      parseQuota(row.values.hisenseblquota ?? ""),
      parseQuota(row.values.hisensewlquota ?? ""),
      parseQuota(row.values.hisensequota ?? ""),
    );

    const key = sapCode.toLowerCase();
    if (bySap.has(key)) duplicateSapCodeCount += 1;

    bySap.set(key, {
      name,
      sapCode,
      areaName,
      status: mapStatus(row.values.status ?? "active"),
      devantQuota,
      hisenseQuota,
      sourceRowNumber: row.rowNumber,
    });
  }

  return {
    rows: [...bySap.values()],
    skippedEmptyCode,
    duplicateSapCodeCount,
    sheetName,
  };
}

/** Default path to the PSG ISMS workbook under docs/. */
export function defaultPsgWorkbookPath(): string {
  return path.join(process.cwd(), "docs", "07.29.26 - PSG ok.xlsx");
}

/**
 * Parse the PSG ISMS sheet (or first PSG-looking sheet) from a workbook buffer.
 * Duplicate BRANCH CODEs: last non-empty row wins.
 */
export async function parsePsgBranchWorkbook(buffer: Buffer): Promise<PsgParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase());

  const isms = byName("ISMS");
  if (isms) {
    const { rows } = readSheetRows(isms);
    return rowsToPsgResult(isms.name, rows);
  }

  for (const sheet of workbook.worksheets) {
    const { columns, rows } = readSheetRows(sheet);
    if (sheetLooksLikePsg(columns)) {
      return rowsToPsgResult(sheet.name, rows);
    }
  }

  const first = workbook.worksheets[0];
  if (!first) {
    return { rows: [], skippedEmptyCode: 0, duplicateSapCodeCount: 0, sheetName: "" };
  }
  const { rows } = readSheetRows(first);
  return rowsToPsgResult(first.name, rows);
}

/** Read the on-disk PSG workbook relative to the repo root. */
export async function parsePsgBranchWorkbookFromPath(
  workbookPath?: string,
): Promise<PsgParseResult> {
  const resolved = workbookPath ?? defaultPsgWorkbookPath();
  if (!fs.existsSync(resolved)) {
    throw new Error(`PSG workbook not found at ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  return parsePsgBranchWorkbook(buffer);
}

/** True when the buffer's first sheet (or ISMS) looks like a PSG export. */
export async function workbookLooksLikePsg(buffer: Buffer): Promise<boolean> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const isms = workbook.worksheets.find((s) => s.name.trim().toLowerCase() === "isms");
  const candidate = isms ?? workbook.worksheets[0];
  if (!candidate) return false;
  const { columns } = readSheetRows(candidate);
  return sheetLooksLikePsg(columns);
}
