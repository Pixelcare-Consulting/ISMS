import ExcelJS from "exceljs";

import {
  PROVINCE_IMPORT_ALIAS_MAP,
  PROVINCE_IMPORT_REQUIRED_COLUMNS,
  PROVINCE_SHEET_HEADERS,
  PROVINCE_SHEET_NAME,
} from "@/features/lookups/schemas/province-import.schema";
import { normalizeHeader, parseCsvTable } from "@/lib/shared/parse-csv";

export interface ProvinceSheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ProvinceTemplateRow {
  name: string;
  region: string;
  status: string;
}

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

function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function assertOurTemplate(columns: Set<string>): void {
  const missing = PROVINCE_IMPORT_REQUIRED_COLUMNS.filter((col) => !columns.has(col));
  if (missing.length > 0) {
    throw new Error("The Provinces sheet needs a province_name column. Download the template.");
  }
}

function readSheet(sheet: ExcelJS.Worksheet): { columns: Set<string>; rows: ProvinceSheetRow[] } {
  const rows: ProvinceSheetRow[] = [];
  const columns = new Set<string>();
  let keys: (string | null)[] | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (!keys) {
      const headerCells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        headerCells[columnNumber - 1] = cellToString(cell.value);
      });
      keys = Array.from(headerCells, (cell) =>
        PROVINCE_IMPORT_ALIAS_MAP[normalizeHeader(cell ?? "")] ?? null,
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
    if (anyValue) rows.push({ rowNumber, values });
  });

  return { columns, rows };
}

/** Build the downloadable Provinces template (current provinces, or a sample row when empty). */
export async function buildProvinceTemplateWorkbook(rows: ProvinceTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(PROVINCE_SHEET_NAME);
  sheet.addRow([...PROVINCE_SHEET_HEADERS]);
  for (const row of rows) sheet.addRow([row.name, row.region, row.status]);
  if (rows.length === 0) sheet.addRow(["CEBU", "R7: C. VISAYAS", "active"]);

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  [32, 28, 10].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Read an .xlsx or .csv upload into canonical-keyed rows. */
export async function readProvinceImportWorkbook(file: Buffer): Promise<ProvinceSheetRow[]> {
  if (!looksLikeXlsx(file)) {
    const table = parseCsvTable(file.toString("utf8"));
    if (table.headers.length === 0) {
      throw new Error("The CSV file has no header row. Download the template.");
    }
    const columns = new Set<string>();
    for (const header of table.headers) {
      const key = PROVINCE_IMPORT_ALIAS_MAP[normalizeHeader(header)];
      if (key) columns.add(key);
    }
    assertOurTemplate(columns);

    return table.records.map((record) => {
      const values: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(record.values)) {
        const canonical = PROVINCE_IMPORT_ALIAS_MAP[rawKey];
        if (canonical) values[canonical] = value;
      }
      return { rowNumber: record.rowNumber, values };
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ArrayBuffer);

  const named = workbook.worksheets.find(
    (candidate) => candidate.name.trim().toLowerCase() === PROVINCE_SHEET_NAME.toLowerCase(),
  );
  const sheet = named ?? workbook.worksheets[0];
  if (!sheet) {
    throw new Error(`Add a sheet named "${PROVINCE_SHEET_NAME}" with the template columns.`);
  }
  const { columns, rows } = readSheet(sheet);
  assertOurTemplate(columns);
  return rows;
}
