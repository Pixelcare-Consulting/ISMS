import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";

import { normalizeHeader } from "@/lib/shared/parse-csv";

/** One MODEL sheet row after last-wins dedupe on skuCode. */
export interface PsgModelRow {
  skuCode: string;
  name: string;
  brandName: string;
  seriesName: string;
  seriesCode: string | null;
  cbm: number | null;
  sourceRowNumber: number;
}

export interface PsgModelParseResult {
  rows: PsgModelRow[];
  skippedEmptySku: number;
  duplicateSkuCount: number;
  sheetName: string;
}

const MODEL_ALIAS_MAP: Record<string, string> = {
  itemno: "itemno",
  "itemno/": "itemno",
  itemname: "itemname",
  onhand: "onhand",
  cbm: "cbm",
  groupcode: "groupcode",
  groupname: "groupname",
};

const BRAND_ALIASES: Record<string, string> = {
  HS: "HISENSE",
  DV: "DEVANT",
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

/** Blank / 0 / 0.00 → null; `0/294` → 0.294 (slash separates integer and fractional digits). */
export function parsePsgCbm(raw: string): number | null {
  const trimmed = raw.trim();
  if (isBlankOrDash(trimmed)) return null;

  if (trimmed.includes("/")) {
    const [leftRaw, rightRaw] = trimmed.split("/", 2);
    const left = (leftRaw ?? "").trim() || "0";
    const right = (rightRaw ?? "").trim();
    if (!right) return null;
    const combined = Number.parseFloat(`${left}.${right}`);
    if (!Number.isFinite(combined) || combined === 0) return null;
    return combined;
  }

  const normalized = trimmed.replace(/,/g, "");
  if (normalized === "0" || normalized === "0.0" || normalized === "0.00") return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return parsed;
}

function brandFromGroupName(groupName: string): string {
  const upper = groupName.trim().toUpperCase();
  if (upper.startsWith("TR-HS")) return "HISENSE";
  if (upper.startsWith("TR-DV")) return "DEVANT";
  if (upper.startsWith("TR-NX")) return "NEXTBASE";
  return "UNKNOWN";
}

/** True when the first token is not a usable brand label (SKU-like, size, fraction, etc.). */
function isGarbageBrandToken(token: string): boolean {
  if (!token || token.length < 2) return true;
  if (/[\d"'\\/.]/.test(token)) return true;
  if (!/^[A-Z][A-Z0-9]*$/i.test(token)) return true;
  return false;
}

/**
 * Brand from Item Name first token (HS→HISENSE, DV→DEVANT);
 * unknown/garbage → Group Name prefix (TR-HS / TR-DV / TR-NX) else UNKNOWN.
 */
export function resolvePsgBrandName(itemName: string, groupName: string): string {
  const firstToken = itemName.trim().split(/\s+/)[0]?.trim() ?? "";
  const upper = firstToken.toUpperCase();
  const aliased = BRAND_ALIASES[upper] ?? upper;

  if (isGarbageBrandToken(aliased) || !aliased) {
    return brandFromGroupName(groupName);
  }
  return aliased;
}

function sheetLooksLikeModel(columns: Set<string>): boolean {
  return columns.has("itemno") && columns.has("itemname");
}

function mapHeaderKeys(cells: string[]): (string | null)[] {
  return cells.map((cell) => MODEL_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
}

function readModelSheetRows(sheet: ExcelJS.Worksheet): {
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
      const candidate = mapHeaderKeys(cells);
      const candidateColumns = new Set(candidate.filter((k): k is string => Boolean(k)));
      // Skip title rows until we see Item No/ + Item Name headers.
      if (!sheetLooksLikeModel(candidateColumns)) return;
      keys = candidate;
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

function rowsToModelResult(
  sheetName: string,
  sheetRows: { rowNumber: number; values: Record<string, string> }[],
): PsgModelParseResult {
  const bySku = new Map<string, PsgModelRow>();
  let skippedEmptySku = 0;
  let duplicateSkuCount = 0;

  for (const row of sheetRows) {
    const skuCode = (row.values.itemno ?? "").trim();
    if (isBlankOrDash(skuCode)) {
      skippedEmptySku += 1;
      continue;
    }

    const name = (row.values.itemname ?? "").trim() || skuCode;
    const groupNameRaw = (row.values.groupname ?? "").trim();
    const groupCodeRaw = (row.values.groupcode ?? "").trim();
    const seriesName =
      (!isBlankOrDash(groupNameRaw) ? groupNameRaw : null) ??
      (!isBlankOrDash(groupCodeRaw) ? groupCodeRaw : null) ??
      "UNKNOWN";
    const seriesCode = isBlankOrDash(groupCodeRaw) ? null : groupCodeRaw;

    const key = skuCode.toLowerCase();
    if (bySku.has(key)) duplicateSkuCount += 1;

    bySku.set(key, {
      skuCode,
      name,
      brandName: resolvePsgBrandName(name, groupNameRaw),
      seriesName,
      seriesCode,
      cbm: parsePsgCbm(row.values.cbm ?? ""),
      sourceRowNumber: row.rowNumber,
    });
  }

  return {
    rows: [...bySku.values()],
    skippedEmptySku,
    duplicateSkuCount,
    sheetName,
  };
}

/** Default path to the PSG workbook under docs/. */
export function defaultPsgWorkbookPath(): string {
  return path.join(process.cwd(), "docs", "07.29.26 - PSG ok.xlsx");
}

/** Parse the MODEL sheet from a workbook buffer. Duplicate Item No/: last non-empty row wins. */
export async function parsePsgModelWorkbook(buffer: Buffer): Promise<PsgModelParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase());

  const model = byName("MODEL");
  if (model) {
    const { rows } = readModelSheetRows(model);
    return rowsToModelResult(model.name, rows);
  }

  for (const sheet of workbook.worksheets) {
    const { columns, rows } = readModelSheetRows(sheet);
    if (sheetLooksLikeModel(columns)) {
      return rowsToModelResult(sheet.name, rows);
    }
  }

  return { rows: [], skippedEmptySku: 0, duplicateSkuCount: 0, sheetName: "" };
}

/** Read the on-disk PSG workbook and parse the MODEL sheet. */
export async function parsePsgModelWorkbookFromPath(
  workbookPath?: string,
): Promise<PsgModelParseResult> {
  const resolved = workbookPath ?? defaultPsgWorkbookPath();
  if (!fs.existsSync(resolved)) {
    throw new Error(`PSG workbook not found at ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  return parsePsgModelWorkbook(buffer);
}
