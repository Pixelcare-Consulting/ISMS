/** Escape a cell for RFC4180-style CSV export. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function buildCsvContent(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [buildCsvRow(headers), ...rows.map((row) => buildCsvRow(row))].join("\r\n");
}
