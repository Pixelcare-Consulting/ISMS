import ExcelJS from "exceljs";

import {
  DEALER_IMPORT_ALIAS_MAP,
  DEALER_IMPORT_REQUIRED_COLUMNS,
  DEALER_SHEET_HEADERS,
  DEALER_SHEET_NAME,
} from "@/features/dealers/schemas/dealer-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface SheetRows {
  present: boolean;
  columns: Set<string>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}

export interface DealerTemplateRow {
  sapCode: string;
  name: string;
  status: string;
  area: string;
  dealerType: string;
  dealerArea: string;
  modeOfPayment: string;
}

const EMPTY_SHEET: SheetRows = { present: false, columns: new Set(), rows: [] };

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

function readSheet(sheet: ExcelJS.Worksheet | undefined): SheetRows {
  if (!sheet) return EMPTY_SHEET;

  const rows: SheetRows["rows"] = [];
  const columns = new Set<string>();
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (!keys) {
      const headerCells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        headerCells[columnNumber - 1] = cellToString(cell.value);
      });
      keys = headerCells.map(
        (cell) => DEALER_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null,
      );
      for (const key of keys) if (key) columns.add(key);
      return;
    }

    const values: Record<string, string> = {};
    let anyValue = false;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const key = keys![columnNumber - 1] ?? null;
      if (!key) return;
      const text = cellToString(cell.value);
      values[key] = text;
      if (text) anyValue = true;
    });
    if (!anyValue) return;
    rows.push({ rowNumber, values });
  });

  return { present: true, columns, rows };
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
  const missing = DEALER_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    throw new Error(
      `The Dealers sheet needs a dealer_name column. Download the template.`,
    );
  }
}

function mapCsvRecord(record: {
  rowNumber: number;
  values: Record<string, string>;
}): { rowNumber: number; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(record.values)) {
    const canonical = DEALER_IMPORT_ALIAS_MAP[rawKey];
    if (canonical) values[canonical] = value;
  }
  return { rowNumber: record.rowNumber, values };
}

/** Build the downloadable Dealers template (current dealers, or a sample row when empty). */
export async function buildDealerTemplateWorkbook(rows: DealerTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(DEALER_SHEET_NAME);
  sheet.addRow([...DEALER_SHEET_HEADERS]);
  for (const row of rows) {
    sheet.addRow([
      row.sapCode,
      row.name,
      row.status,
      row.area,
      row.dealerType,
      row.dealerArea,
      row.modeOfPayment,
    ]);
  }
  if (rows.length === 0) {
    sheet.addRow(["C00001", "ABENSON VENTURES INC.", "active", "", "", "", ""]);
  }
  styleHeader(sheet, [16, 40, 10, 18, 18, 18, 18]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Read an .xlsx or .csv upload. Accepts only our Dealers template columns. */
export async function readDealerImportWorkbook(file: Buffer): Promise<SheetRows> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    for (const header of table.headers) {
      const key = DEALER_IMPORT_ALIAS_MAP[normalizeHeader(header)];
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

  const named = workbook.worksheets.find(
    (candidate) => candidate.name.trim().toLowerCase() === DEALER_SHEET_NAME.toLowerCase(),
  );
  if (named) {
    const sheet = readSheet(named);
    assertOurTemplate(sheet.columns);
    return sheet;
  }

  for (const candidate of workbook.worksheets) {
    const sheet = readSheet(candidate);
    if (DEALER_IMPORT_REQUIRED_COLUMNS.every((col) => sheet.columns.has(col))) {
      return sheet;
    }
  }

  const first = readSheet(workbook.worksheets[0]);
  if (!first.present) {
    throw new Error(`Add a sheet named "${DEALER_SHEET_NAME}" with the template columns.`);
  }
  assertOurTemplate(first.columns);
  return first;
}
