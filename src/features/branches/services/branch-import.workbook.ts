import ExcelJS from "exceljs";

import {
  ALLOWED_MODEL_SHEET_HEADERS,
  ALLOWED_MODEL_SHEET_NAME,
  BRANCH_IMPORT_ALIAS_MAP,
  BRANCH_SHEET_HEADERS,
  BRANCH_SHEET_NAME,
} from "@/features/branches/schemas/branch-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

/** A sheet reduced to header-keyed rows, with the row numbers users see in Excel. */
export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface ImportWorkbook {
  branches: SheetRows;
  allowedModels: SheetRows;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Formulas, rich text and hyperlinks — take the displayed text.
    if ("result" in value && value.result != null) return cellToString(value.result);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return "";
}

function readSheet(sheet: ExcelJS.Worksheet | undefined): SheetRows {
  if (!sheet) return EMPTY_SHEET;

  const rows: SheetRows["rows"] = [];
  const columns = new Set<string>();
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellToString(cell.value);
    });

    if (!keys) {
      keys = cells.map((cell) => BRANCH_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null);
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

  return { present: true, columns, rows };
}

/** True for the ZIP magic bytes every .xlsx file starts with. */
function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Read an upload into the two logical sheets. A plain CSV is accepted as the
 * Branches sheet alone — handy for a quick rename pass with no allowed models.
 */
export async function readImportWorkbook(buffer: Buffer): Promise<ImportWorkbook> {
  if (!looksLikeXlsx(buffer)) {
    const table = parseCsvTable(buffer.toString("utf8"));
    const columns = new Set<string>();
    for (const header of table.headers) {
      const key = BRANCH_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    const rows = table.records.map((record) => {
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(record.values)) {
        const canonical = BRANCH_IMPORT_ALIAS_MAP[key];
        if (canonical) values[canonical] = value;
      }
      return { rowNumber: record.rowNumber, values };
    });
    return {
      branches: { present: true, columns, rows },
      allowedModels: EMPTY_SHEET,
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find(
      (sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase(),
    );

  // Fall back to sheet order when tabs have been renamed.
  const branchSheet = byName(BRANCH_SHEET_NAME) ?? workbook.worksheets[0];
  const allowedSheet = byName(ALLOWED_MODEL_SHEET_NAME) ?? workbook.worksheets[1];

  return {
    branches: readSheet(branchSheet),
    allowedModels: readSheet(allowedSheet === branchSheet ? undefined : allowedSheet),
  };
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

/**
 * Build the downloadable template: Branches pre-filled with the tenant's active
 * branches, Allowed Models left empty for the user to fill in.
 */
export async function buildTemplateWorkbook(
  branches: { sapCode: string; name: string }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const branchSheet = workbook.addWorksheet(BRANCH_SHEET_NAME);
  branchSheet.addRow(BRANCH_SHEET_HEADERS);
  for (const branch of branches) {
    branchSheet.addRow([branch.sapCode, branch.name]);
  }
  if (branches.length === 0) {
    branchSheet.addRow(["BR-001", "Example Branch"]);
  }
  styleHeader(branchSheet, [18, 40]);
  // sap_code identifies an existing branch; editing it would point at a different
  // branch rather than rename this one, so lock the column against accidents.
  branchSheet.getColumn(1).protection = { locked: true };

  const allowedSheet = workbook.addWorksheet(ALLOWED_MODEL_SHEET_NAME);
  allowedSheet.addRow(ALLOWED_MODEL_SHEET_HEADERS);
  styleHeader(allowedSheet, [18, 24]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
