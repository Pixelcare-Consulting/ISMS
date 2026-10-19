/**
 * Column headers of the client-approved CSV exports. The exports and the
 * Stimulsoft previews both read these, so the two can't drift apart.
 * (Inventory headers live in utils/inventory-report-csv.ts.)
 */

export const SALES_REPORT_HEADERS = [
  "DATE",
  "TRANSACTION NO",
  "BRANCH",
  "STOCK SOURCE BRANCH",
  "SERIAL NO",
  "MODEL",
  "PACKAGE",
  "SALE AMOUNT",
  "ATR STATUS",
  "RETURN STATUS",
  "CUSTOMER",
  "SI/TRANS",
] as const;

export const TRANSFER_REPORT_HEADERS = [
  "TRANSFER NO",
  "FROM BRANCH",
  "TO BRANCH",
  "STATUS",
  "DATE",
  "NOTES",
] as const;

export const PROCESSED_ORDERS_REPORT_HEADERS = [
  "DATE PROCESSED",
  "DEALER NAME",
  "BRANCH NAME",
  "BRAND",
  "SO",
  "MODEL",
  "BRANCH ORDER",
  "APPROVED QTY",
  "ORDER REMARKS",
  "SPA REMARKS",
  "LAST UPDATED BY",
  "SPA APPROVED BY",
  "SPA DATETIME APPROVED",
  "DELIVERY DUE DATE",
  "TOTAL CBM",
  "AREA",
  "REGION",
  "PROVINCE",
] as const;

export const DAILY_STOCK_REPORT_HEADERS = [
  "DATE",
  "BRANCH",
  "SKU",
  "MODEL NAME",
  "SHELF MAX",
  "INV",
  "SOLD",
] as const;
