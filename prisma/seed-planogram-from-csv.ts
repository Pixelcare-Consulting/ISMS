import fs from "node:fs";
import path from "node:path";

export interface PlanogramBranchTarget {
  branchIndex: 1 | 2 | 3 | 4;
  maxQty: number;
}

export interface PlanogramCsvRow {
  brand: string;
  skuCode: string;
  modelName: string;
  series: string;
  srp: number | null;
  branches: PlanogramBranchTarget[];
}

/** Dealer 1 branch columns in BRS Planogram CSV (0-based pair start indices). */
const DEALER1_BRANCH_COLS: Record<1 | 2 | 3 | 4, number> = {
  1: 5,
  2: 7,
  3: 9,
  4: 11,
};

const DEFAULT_MIL_DAYS = 30;

export const DEFAULT_MIL_DAYS_EXPORT = DEFAULT_MIL_DAYS;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseQty(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseSrp(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOnPlanogram(flag: string | undefined): boolean {
  return flag?.trim().toUpperCase() === "Y";
}

export function parsePlanogramCsv(csvPath?: string): PlanogramCsvRow[] {
  const resolvedPath =
    csvPath ??
    path.join(
      process.cwd(),
      "docs",
      "BRS Planogram & Forecast(Planogram & Target).csv",
    );

  const content = fs.readFileSync(resolvedPath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: PlanogramCsvRow[] = [];

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const brand = cells[0]?.trim() ?? "";
    const skuCode = cells[1]?.trim() ?? "";
    const modelName = cells[2]?.trim() || skuCode;
    const series = cells[3]?.trim() ?? "";
    const srpRaw = cells[4]?.trim() ?? "";

    if (!brand || !skuCode) continue;
    if (series === "SWS-01" || srpRaw.toLowerCase() === "free") continue;
    if (skuCode === "SWS-01") continue;

    const branches: PlanogramBranchTarget[] = [];

    for (const branchIndex of [1, 2, 3, 4] as const) {
      const col = DEALER1_BRANCH_COLS[branchIndex];
      const onFlag = cells[col];
      const qtyRaw = cells[col + 1];

      if (!isOnPlanogram(onFlag)) continue;

      const parsedQty = parseQty(qtyRaw);
      branches.push({
        branchIndex,
        maxQty: parsedQty ?? 1,
      });
    }

    if (branches.length === 0) continue;

    rows.push({
      brand,
      skuCode,
      modelName,
      series,
      srp: parseSrp(srpRaw),
      branches,
    });
  }

  return rows;
}

export const DEALER1_BRANCH_MAP = [
  { branchIndex: 1 as const, sapCode: "WMK-001", name: "Western Makati" },
  { branchIndex: 2 as const, sapCode: "WRC-002", name: "Western Recto" },
  { branchIndex: 3 as const, sapCode: "WQC-003", name: "Western Quezon City" },
  { branchIndex: 4 as const, sapCode: "WPAS-004", name: "Western Pasig" },
] as const;

export interface ForecastCsvMeta {
  periodLabel: string;
  branchRevenueTargets: { branchIndex: 1 | 2 | 3 | 4; revenueTarget: number }[];
}

function parseRevenueTarget(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").replace(/[^\d.]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Parse row 1 (PERIOD) and row 3 (branch revenue targets) from BRS CSV. */
export function parseForecastCsv(csvPath?: string): ForecastCsvMeta {
  const resolvedPath =
    csvPath ??
    path.join(
      process.cwd(),
      "docs",
      "BRS Planogram & Forecast(Planogram & Target).csv",
    );

  const content = fs.readFileSync(resolvedPath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const periodRow = parseCsvLine(lines[0] ?? "");
  const periodLabel =
    periodRow[1]?.trim() ||
    periodRow.find((cell) => /^\w+-\d{2}$/i.test(cell.trim()))?.trim() ||
    "Dec-25";

  const revenueRow = parseCsvLine(lines[2] ?? "");
  const branchRevenueTargets: ForecastCsvMeta["branchRevenueTargets"] = [];

  for (const branchIndex of [1, 2, 3, 4] as const) {
    const col = DEALER1_BRANCH_COLS[branchIndex];
    const amount = parseRevenueTarget(revenueRow[col]);
    if (amount != null) {
      branchRevenueTargets.push({ branchIndex, revenueTarget: amount });
    }
  }

  return { periodLabel, branchRevenueTargets };
}

export function readPlanogramCsvContent(csvPath?: string): string {
  const resolvedPath =
    csvPath ??
    path.join(
      process.cwd(),
      "docs",
      "BRS Planogram & Forecast(Planogram & Target).csv",
    );
  return fs.readFileSync(resolvedPath, "utf8");
}

export function parsePlanogramCsvFromContent(content: string): PlanogramCsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: PlanogramCsvRow[] = [];

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const brand = cells[0]?.trim() ?? "";
    const skuCode = cells[1]?.trim() ?? "";
    const modelName = cells[2]?.trim() || skuCode;
    const series = cells[3]?.trim() ?? "";
    const srpRaw = cells[4]?.trim() ?? "";

    if (!brand || !skuCode) continue;
    if (series === "SWS-01" || srpRaw.toLowerCase() === "free") continue;
    if (skuCode === "SWS-01") continue;

    const branches: PlanogramBranchTarget[] = [];

    for (const branchIndex of [1, 2, 3, 4] as const) {
      const col = DEALER1_BRANCH_COLS[branchIndex];
      const onFlag = cells[col];
      const qtyRaw = cells[col + 1];

      if (!isOnPlanogram(onFlag)) continue;

      const parsedQty = parseQty(qtyRaw);
      branches.push({
        branchIndex,
        maxQty: parsedQty ?? 1,
      });
    }

    if (branches.length === 0) continue;

    rows.push({
      brand,
      skuCode,
      modelName,
      series,
      srp: parseSrp(srpRaw),
      branches,
    });
  }

  return rows;
}

export function parseForecastFromContent(content: string): ForecastCsvMeta {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const periodRow = parseCsvLine(lines[0] ?? "");
  const periodLabel =
    periodRow[1]?.trim() ||
    periodRow.find((cell) => /^\w+-\d{2}$/i.test(cell.trim()))?.trim() ||
    "Dec-25";

  const revenueRow = parseCsvLine(lines[2] ?? "");
  const branchRevenueTargets: ForecastCsvMeta["branchRevenueTargets"] = [];

  for (const branchIndex of [1, 2, 3, 4] as const) {
    const col = DEALER1_BRANCH_COLS[branchIndex];
    const amount = parseRevenueTarget(revenueRow[col]);
    if (amount != null) {
      branchRevenueTargets.push({ branchIndex, revenueTarget: amount });
    }
  }

  return { periodLabel, branchRevenueTargets };
}
