import type { DemandPlanningGridLine } from "@/features/demand-planning/types/run.types";

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

const HEADERS = [
  "Branch",
  "SKU",
  "Series",
  "SRP",
  "Planogram",
  "History qty",
  "History ₱",
  "HMIX",
  "Adj HMIX",
  "MIL qty",
  "MIL ₱",
  "Display units",
  "On hand",
  "Forecast qty",
  "Forecast ₱",
  "Alloc qty",
  "Alloc ₱",
  "Cycle qty",
  "Drop 1 qty",
  "Drop 1 ₱",
  "Total inv qty",
  "Total inv ₱",
] as const;

export function demandPlanningGridToCsv(
  rows: Array<DemandPlanningGridLine & { branchLabel: string }>,
): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    const drop1 = row.releasedDrop1Qty ?? row.computedDrop1Qty;
    lines.push(
      [
        row.branchLabel,
        row.skuCode,
        row.seriesCode,
        row.srp,
        row.planogramFlag,
        row.historyQty,
        row.historyPeso,
        row.hmix,
        row.adjHmix,
        row.milQty,
        row.milPeso,
        row.displayUnits,
        row.onHandQty,
        row.forecastQty,
        row.forecastPeso,
        row.allocQty,
        row.allocPeso,
        row.cycleQty,
        drop1,
        row.drop1Peso,
        row.totalInventoryQty,
        row.totalInventoryPeso,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
