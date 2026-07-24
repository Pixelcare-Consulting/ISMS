/**
 * RFC4180-style CSV reader — the counterpart to the writers in `./csv.ts`.
 * Handles quoted cells, embedded commas/newlines, escaped quotes, CRLF and a UTF-8 BOM.
 *
 * Blank rows are preserved so callers can report errors against the physical line
 * number the user sees in their spreadsheet.
 */
export function parseCsvRows(content: string): string[][] {
  const text = content.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // Swallow; the \n that follows terminates the row.
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((value) => value.trim() === "");
}

/** Normalize a header cell so "SAP Code", "sap_code" and "sapcode" all match. */
export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export interface CsvTable {
  /** Header cells as written in the file, for echoing back in error messages. */
  headers: string[];
  /** One record per data row; keys are normalized headers. */
  records: { rowNumber: number; values: Record<string, string> }[];
}

/**
 * Parse a CSV into header-keyed records. `rowNumber` is the 1-based line in the
 * original file (header = row 1) so validation messages point at the spreadsheet.
 */
export function parseCsvTable(content: string): CsvTable {
  const rows = parseCsvRows(content);
  const headerIndex = rows.findIndex((cells) => !isBlankRow(cells));
  if (headerIndex === -1) return { headers: [], records: [] };

  const headers = rows[headerIndex].map((cell) => cell.trim());
  const keys = headers.map(normalizeHeader);

  const records: CsvTable["records"] = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (isBlankRow(cells)) continue;

    const values: Record<string, string> = {};
    keys.forEach((key, columnIndex) => {
      if (!key) return;
      values[key] = (cells[columnIndex] ?? "").trim();
    });
    records.push({ rowNumber: i + 1, values });
  }

  return { headers, records };
}
