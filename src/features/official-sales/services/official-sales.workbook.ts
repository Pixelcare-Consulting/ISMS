import ExcelJS from "exceljs";

/** Dealer spreadsheet header row (columns A–L). */
export const OFFICIAL_SALES_TEMPLATE_HEADERS = [
  "DEALER",
  "BRAND",
  "BRANCH NAME",
  "DR DATE",
  "DR NO.",
  "ITEM/MODEL",
  "SERIAL NUMBER",
  "SALE AMOUNT",
  "DATE",
  "SI/TRANS NO.",
  "PACKAGE",
  "ACTION KEY",
] as const;

const SHEET_NAME = "Official Sales";

const HEADER_FILLS: (string | null)[] = [
  "FFD9D9D9", // DEALER — gray
  "FFF4B183", // BRAND — orange
  "FFD9D9D9", // BRANCH NAME — gray
  "FFD9D9D9", // DR DATE — gray
  "FFD9D9D9", // DR NO. — gray
  "FFD9D9D9", // ITEM/MODEL — gray
  "FFD9D9D9", // SERIAL NUMBER — gray
  "FFFFE699", // SALE AMOUNT — yellow
  "FFF4B183", // DATE — orange
  "FFF4B183", // SI/TRANS NO. — orange
  "FFF4B183", // PACKAGE — orange
  null, // ACTION KEY — white / border only
];

const COLUMN_WIDTHS = [14, 12, 22, 12, 12, 18, 20, 14, 12, 14, 14, 12];

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

/**
 * Build the downloadable Official Sales dealer template (ExcelJS styled headers + sample row).
 */
export async function buildOfficialSalesTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISMS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.addRow([...OFFICIAL_SALES_TEMPLATE_HEADERS]);
  // Sample rows: Action Key drives process (ADD / DEL / WHSE_ADD).
  sheet.addRow([
    "Sample Dealer",
    "Sample Brand",
    "Sample Branch",
    "2026-08-04",
    "DR-0001",
    "SAMPLE-MODEL",
    "SAMPLE-SERIAL-001",
    0,
    "2026-08-04",
    "SI-0001",
    "Sample Package",
    "ADD",
  ]);
  sheet.addRow([
    "Sample Dealer",
    "Sample Brand",
    "Sample Branch",
    "2026-08-04",
    "DR-0002",
    "SAMPLE-MODEL",
    "SAMPLE-SERIAL-002",
    0,
    "2026-08-04",
    "SI-0002",
    "Sample Package",
    "DEL",
  ]);
  sheet.addRow([
    "Sample Dealer",
    "Sample Brand",
    "Sample Branch",
    "2026-08-04",
    "DR-0003",
    "SAMPLE-MODEL",
    "SAMPLE-SERIAL-003",
    0,
    "2026-08-04",
    "SI-0003",
    "Sample Package",
    "WHSE_ADD",
  ]);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 22;

  OFFICIAL_SALES_TEMPLATE_HEADERS.forEach((_, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.border = THIN_BORDER;
    const fill = HEADER_FILLS[index];
    if (fill) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    }
  });

  for (let rowIndex = 2; rowIndex <= 4; rowIndex += 1) {
    const sampleRow = sheet.getRow(rowIndex);
    sampleRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = THIN_BORDER;
    });
  }

  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
