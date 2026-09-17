import type { DemandPlanningPlanStatus, DemandPlanningRunStatus } from "@prisma/client";

import { decimalToNumber, decimalToNumberOrNull } from "@/lib/database/decimal";
import { parseRunParameters } from "@/features/demand-planning/lib/run-snapshot";
import type {
  DemandPlanningClientRun,
  DemandPlanningClientRunBranch,
  DemandPlanningClientRunListItem,
  DemandPlanningGridLine,
  DemandPlanningGridTotals,
} from "@/features/demand-planning/types/run.types";
import type { PlanogramFlag } from "@/features/demand-planning/engine/demand-planning.types";

type Decimalish = { toString(): string } | number | null | undefined;

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asPlanogramFlag(value: string): PlanogramFlag {
  if (value === "Y" || value === "free") return value;
  return "blank";
}

export function toGridTotals(branch: {
  historyQty: Decimalish;
  historyPeso: Decimalish;
  milQty: number;
  milPeso: Decimalish;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
  forecastPeso: Decimalish;
  allocQty: number;
  allocPeso: Decimalish;
  cycleQty: number;
  drop1Qty: number;
  drop1Peso: Decimalish;
  planogramSkuCount: number;
}): DemandPlanningGridTotals {
  return {
    historyQty: decimalToNumber(branch.historyQty),
    historyPeso: decimalToNumber(branch.historyPeso),
    milQty: branch.milQty,
    milPeso: decimalToNumber(branch.milPeso),
    displayUnits: branch.displayUnits,
    onHandQty: branch.onHandQty,
    forecastQty: branch.forecastQty,
    forecastPeso: decimalToNumber(branch.forecastPeso),
    allocQty: branch.allocQty,
    allocPeso: decimalToNumber(branch.allocPeso),
    cycleQty: branch.cycleQty,
    drop1Qty: branch.drop1Qty,
    drop1Peso: decimalToNumber(branch.drop1Peso),
    totalInventoryQty: branch.milQty + branch.displayUnits + branch.onHandQty + branch.forecastQty,
    totalInventoryPeso:
      decimalToNumber(branch.milPeso) + decimalToNumber(branch.forecastPeso),
    planogramSkuCount: branch.planogramSkuCount,
  };
}

export function sumGridLineTotals(
  lines: DemandPlanningGridLine[],
): DemandPlanningGridTotals {
  return lines.reduce<DemandPlanningGridTotals>(
    (sum, line) => {
      sum.historyQty += line.historyQty;
      sum.historyPeso += line.historyPeso;
      sum.milQty += line.milQty;
      sum.milPeso += line.milPeso;
      sum.displayUnits += line.displayUnits;
      sum.onHandQty += line.onHandQty;
      sum.forecastQty += line.forecastQty;
      sum.forecastPeso += line.forecastPeso;
      sum.allocQty += line.allocQty;
      sum.allocPeso += line.allocPeso;
      sum.cycleQty += line.cycleQty;
      sum.drop1Qty += line.releasedDrop1Qty ?? line.computedDrop1Qty;
      sum.drop1Peso += line.drop1Peso;
      sum.totalInventoryQty += line.totalInventoryQty;
      sum.totalInventoryPeso += line.totalInventoryPeso;
      if (line.planogramFlag === "Y") sum.planogramSkuCount += 1;
      return sum;
    },
    {
      historyQty: 0,
      historyPeso: 0,
      milQty: 0,
      milPeso: 0,
      displayUnits: 0,
      onHandQty: 0,
      forecastQty: 0,
      forecastPeso: 0,
      allocQty: 0,
      allocPeso: 0,
      cycleQty: 0,
      drop1Qty: 0,
      drop1Peso: 0,
      totalInventoryQty: 0,
      totalInventoryPeso: 0,
      planogramSkuCount: 0,
    },
  );
}

export function toGridLine(line: {
  id: string;
  runBranchId: string;
  modelId: string;
  skuCode: string;
  seriesCode: string;
  srp: Decimalish;
  planogramFlag: string;
  historyQty: Decimalish;
  historyPeso: Decimalish;
  hmix: Decimalish;
  adjHmix: Decimalish;
  milQty: number;
  milPeso: Decimalish;
  computedDisplayUnits: number;
  displayUnits: number;
  onHandQty: number;
  computedForecastQty: number;
  forecastQty: number;
  forecastPeso: Decimalish;
  allocQty: number;
  allocPeso: Decimalish;
  cycleQty: number;
  computedDrop1Qty: number;
  releasedDrop1Qty: number | null;
  drop1Peso: Decimalish;
  totalInventoryQty: number;
  totalInventoryPeso: Decimalish;
}): DemandPlanningGridLine {
  return {
    id: line.id,
    runBranchId: line.runBranchId,
    modelId: line.modelId,
    skuCode: line.skuCode,
    seriesCode: line.seriesCode,
    srp: decimalToNumber(line.srp),
    planogramFlag: asPlanogramFlag(line.planogramFlag),
    historyQty: decimalToNumber(line.historyQty),
    historyPeso: decimalToNumber(line.historyPeso),
    hmix: decimalToNumber(line.hmix),
    adjHmix: decimalToNumber(line.adjHmix),
    milQty: line.milQty,
    milPeso: decimalToNumber(line.milPeso),
    computedDisplayUnits: line.computedDisplayUnits,
    displayUnits: line.displayUnits,
    onHandQty: line.onHandQty,
    computedForecastQty: line.computedForecastQty,
    forecastQty: line.forecastQty,
    forecastPeso: decimalToNumber(line.forecastPeso),
    allocQty: line.allocQty,
    allocPeso: decimalToNumber(line.allocPeso),
    cycleQty: line.cycleQty,
    computedDrop1Qty: line.computedDrop1Qty,
    releasedDrop1Qty: line.releasedDrop1Qty,
    drop1Peso: decimalToNumber(line.drop1Peso),
    totalInventoryQty: line.totalInventoryQty,
    totalInventoryPeso: decimalToNumber(line.totalInventoryPeso),
  };
}

export function toClientRunBranch(row: {
  id: string;
  branchId: string;
  planStatus: DemandPlanningPlanStatus;
  quotaPeso: Decimalish;
  minLevelDays: Decimalish;
  minLevelPeso: Decimalish;
  dropsPerMonth: Decimalish;
  coverageDays: Decimalish;
  historyQty: Decimalish;
  historyPeso: Decimalish;
  milQty: number;
  milPeso: Decimalish;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
  forecastPeso: Decimalish;
  allocQty: number;
  allocPeso: Decimalish;
  cycleQty: number;
  drop1Qty: number;
  drop1Peso: Decimalish;
  planogramSkuCount: number;
  branch: { sapCode: string; name: string };
}): DemandPlanningClientRunBranch {
  return {
    id: row.id,
    branchId: row.branchId,
    sapCode: row.branch.sapCode,
    name: row.branch.name,
    planStatus: row.planStatus,
    quotaPeso: decimalToNumber(row.quotaPeso),
    minLevelDays: decimalToNumber(row.minLevelDays),
    minLevelPeso: decimalToNumber(row.minLevelPeso),
    dropsPerMonth: decimalToNumber(row.dropsPerMonth),
    coverageDays: decimalToNumberOrNull(row.coverageDays),
    totals: toGridTotals(row),
  };
}

export function toClientRunListItem(row: {
  id: string;
  documentNumber: string;
  version: number;
  status: DemandPlanningRunStatus;
  name: string | null;
  createdAt: Date;
  releasedAt: Date | null;
  period: { label: string };
  branches: Array<{ planStatus: DemandPlanningPlanStatus; drop1Qty: number; drop1Peso: Decimalish }>;
  originalDocumentNumber?: string | null;
}): DemandPlanningClientRunListItem {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    version: row.version,
    status: row.status,
    name: row.name,
    periodLabel: row.period.label,
    createdAt: row.createdAt.toISOString(),
    releasedAt: asIso(row.releasedAt),
    branchCount: row.branches.length,
    plannedBranchCount: row.branches.filter((branch) => branch.planStatus === "planned").length,
    drop1Qty: row.branches.reduce((sum, branch) => sum + branch.drop1Qty, 0),
    drop1Peso: row.branches.reduce((sum, branch) => sum + decimalToNumber(branch.drop1Peso), 0),
    originalDocumentNumber: row.originalDocumentNumber ?? null,
  };
}

export function toClientRun(row: {
  id: string;
  documentNumber: string;
  version: number;
  status: DemandPlanningRunStatus;
  name: string | null;
  periodId: string;
  createdAt: Date;
  releasedAt: Date | null;
  historyFrom: Date | null;
  historyTo: Date | null;
  onHandAsAt: Date | null;
  parameters: unknown;
  historySkuCount: number | null;
  historyPeso: Decimalish;
  planogramYCount: number | null;
  planogramSkuCount: number | null;
  forecastUnitCount: number | null;
  forecastPeso: Decimalish;
  onHandUnitCount: number | null;
  onHandPeso: Decimalish;
  displayUnitsCount: number | null;
  period: { label: string };
  branches: Array<Parameters<typeof toClientRunBranch>[0]>;
  originalDocumentNumber?: string | null;
}): DemandPlanningClientRun {
  const parameters = parseRunParameters(row.parameters);
  const branches = row.branches.map(toClientRunBranch);
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    version: row.version,
    status: row.status,
    name: row.name,
    periodId: row.periodId,
    periodLabel: row.period.label,
    historyFrom: asIso(row.historyFrom),
    historyTo: asIso(row.historyTo),
    onHandAsAt: asIso(row.onHandAsAt),
    releasedAt: asIso(row.releasedAt),
    createdAt: row.createdAt.toISOString(),
    parameters,
    stamps: {
      historySkuCount: row.historySkuCount,
      historyPeso: decimalToNumberOrNull(row.historyPeso),
      planogramYCount: row.planogramYCount,
      planogramSkuCount: row.planogramSkuCount,
      forecastUnitCount: row.forecastUnitCount,
      forecastPeso: decimalToNumberOrNull(row.forecastPeso),
      onHandUnitCount: row.onHandUnitCount,
      onHandPeso: decimalToNumberOrNull(row.onHandPeso),
      displayUnitsCount: row.displayUnitsCount,
    },
    plannedBranchCount: branches.filter((branch) => branch.planStatus === "planned").length,
    branchCount: branches.length,
    drop1Qty: branches.reduce((sum, branch) => sum + branch.totals.drop1Qty, 0),
    drop1Peso: branches.reduce((sum, branch) => sum + branch.totals.drop1Peso, 0),
    branches,
    originalDocumentNumber: row.originalDocumentNumber ?? null,
  };
}
