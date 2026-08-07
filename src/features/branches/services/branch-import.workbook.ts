import ExcelJS from "exceljs";

import {
  ALLOWED_MODEL_SHEET_NAME,
  BRANCH_IMPORT_ALIAS_MAP,
  BRANCH_SHEET_HEADERS,
  BRANCH_SHEET_NAME,
} from "@/features/branches/schemas/branch-import.schema";
import { WEEKDAY_SHORT } from "@/features/orders/utils/order-window";
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
  /** True when the Branches side came from a PSG-style ISMS / single sheet. */
  psgStyle: boolean;
}

export interface BranchTemplateRow {
  sapCode: string;
  name: string;
  status: string;
  dealer: string;
  primaryWarehouse: string;
  branchArea: string;
  area: string;
  region: string;
  province: string;
  alternateBranches: string;
  frequencyCode: string;
  deliveryDays: string;
  orderDays: string;
  scheduleNotes: string;
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

function looksLikePsgColumns(columns: Set<string>): boolean {
  return (
    columns.has("sapcode") &&
    (columns.has("area") || columns.has("devantquota") || columns.has("hisenseblquota") || columns.has("status")) &&
    !columns.has("brancharea")
  );
}

/** True for the ZIP magic bytes every .xlsx file starts with. */
function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Read an upload into the two logical sheets. A plain CSV is accepted as the
 * Branches sheet alone — handy for a quick rename pass with no allowed models.
 * PSG ISMS workbooks (sheet named ISMS, or first sheet with PSG headers) are
 * accepted as a single Branches sheet.
 * Legacy "Allowed Models" sheets are still parsed when present.
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
      psgStyle: looksLikePsgColumns(columns),
    };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const byName = (name: string) =>
    workbook.worksheets.find(
      (sheet) => sheet.name.trim().toLowerCase() === name.toLowerCase(),
    );

  const ismsSheet = byName("ISMS");
  if (ismsSheet) {
    const branches = readSheet(ismsSheet);
    return {
      branches,
      allowedModels: EMPTY_SHEET,
      psgStyle: true,
    };
  }

  const namedBranches = byName(BRANCH_SHEET_NAME);
  const namedAllowed = byName(ALLOWED_MODEL_SHEET_NAME);

  if (namedBranches || namedAllowed) {
    const branchSheet = namedBranches ?? workbook.worksheets[0];
    const allowedSheet = namedAllowed ?? workbook.worksheets[1];
    const branches = readSheet(branchSheet);
    return {
      branches,
      allowedModels: readSheet(allowedSheet === branchSheet ? undefined : allowedSheet),
      psgStyle: looksLikePsgColumns(branches.columns),
    };
  }

  // Unnamed / PSG-style: use first sheet that looks like PSG, else sheet order.
  for (const sheet of workbook.worksheets) {
    const candidate = readSheet(sheet);
    if (looksLikePsgColumns(candidate.columns)) {
      return {
        branches: candidate,
        allowedModels: EMPTY_SHEET,
        psgStyle: true,
      };
    }
  }

  const branchSheet = workbook.worksheets[0];
  const allowedSheet = workbook.worksheets[1];
  const branches = readSheet(branchSheet);
  return {
    branches,
    allowedModels: readSheet(allowedSheet === branchSheet ? undefined : allowedSheet),
    psgStyle: looksLikePsgColumns(branches.columns),
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

export function formatWeekdayListForTemplate(days: number[]): string {
  return days
    .filter((day) => day >= 0 && day <= 6)
    .map((day) => WEEKDAY_SHORT[day])
    .join(",");
}

/**
 * Build the downloadable template: a single Branches sheet pre-filled with the
 * tenant's active branches (form-aligned columns). Allowed Models is not added.
 */
export async function buildTemplateWorkbook(branches: BranchTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const branchSheet = workbook.addWorksheet(BRANCH_SHEET_NAME);
  branchSheet.addRow([...BRANCH_SHEET_HEADERS]);
  for (const branch of branches) {
    branchSheet.addRow([
      branch.sapCode,
      branch.name,
      branch.status,
      branch.dealer,
      branch.primaryWarehouse,
      branch.branchArea,
      branch.area,
      branch.region,
      branch.province,
      branch.alternateBranches,
      branch.frequencyCode,
      branch.deliveryDays,
      branch.orderDays,
      branch.scheduleNotes,
    ]);
  }
  if (branches.length === 0) {
    branchSheet.addRow([
      "BR-001",
      "Example Branch",
      "active",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Mon,Wed,Fri",
      "Tue,Thu",
      "",
    ]);
  }
  styleHeader(branchSheet, [14, 28, 10, 22, 20, 16, 16, 14, 14, 28, 14, 16, 16, 24]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
