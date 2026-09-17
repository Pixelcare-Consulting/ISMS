import type { DemandPlanningPlanStatus, DemandPlanningRunStatus } from "@prisma/client";

import type { PlanogramFlag } from "@/features/demand-planning/engine/demand-planning.types";

export type DemandPlanningGridLine = {
  id: string;
  runBranchId: string;
  modelId: string;
  skuCode: string;
  seriesCode: string;
  srp: number;
  planogramFlag: PlanogramFlag;
  historyQty: number;
  historyPeso: number;
  hmix: number;
  adjHmix: number;
  milQty: number;
  milPeso: number;
  computedDisplayUnits: number;
  displayUnits: number;
  onHandQty: number;
  computedForecastQty: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  cycleQty: number;
  computedDrop1Qty: number;
  releasedDrop1Qty: number | null;
  drop1Peso: number;
  totalInventoryQty: number;
  totalInventoryPeso: number;
};

export type DemandPlanningGridTotals = {
  historyQty: number;
  historyPeso: number;
  milQty: number;
  milPeso: number;
  displayUnits: number;
  onHandQty: number;
  forecastQty: number;
  forecastPeso: number;
  allocQty: number;
  allocPeso: number;
  cycleQty: number;
  drop1Qty: number;
  drop1Peso: number;
  totalInventoryQty: number;
  totalInventoryPeso: number;
  planogramSkuCount: number;
};

export type DemandPlanningClientRunBranch = {
  id: string;
  branchId: string;
  sapCode: string;
  name: string;
  planStatus: DemandPlanningPlanStatus;
  quotaPeso: number;
  minLevelDays: number;
  minLevelPeso: number;
  dropsPerMonth: number;
  coverageDays: number | null;
  totals: DemandPlanningGridTotals;
};

export type DemandPlanningClientRun = {
  id: string;
  documentNumber: string;
  version: number;
  status: DemandPlanningRunStatus;
  name: string | null;
  periodId: string;
  periodLabel: string;
  historyFrom: string | null;
  historyTo: string | null;
  onHandAsAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  parameters: {
    monthBasisDays: number;
    roundUpToOne: boolean;
    floorAllocationAtZero: boolean;
    quotaMode: "derive_from_forecast" | "branch_target";
    frequencyOverride: number | null;
  };
  stamps: {
    historySkuCount: number | null;
    historyPeso: number | null;
    planogramYCount: number | null;
    planogramSkuCount: number | null;
    forecastUnitCount: number | null;
    forecastPeso: number | null;
    onHandUnitCount: number | null;
    onHandPeso: number | null;
    displayUnitsCount: number | null;
  };
  plannedBranchCount: number;
  branchCount: number;
  drop1Qty: number;
  drop1Peso: number;
  branches: DemandPlanningClientRunBranch[];
  originalDocumentNumber: string | null;
};

export type DemandPlanningClientRunListItem = {
  id: string;
  documentNumber: string;
  version: number;
  status: DemandPlanningRunStatus;
  name: string | null;
  periodLabel: string;
  createdAt: string;
  releasedAt: string | null;
  branchCount: number;
  plannedBranchCount: number;
  drop1Qty: number;
  drop1Peso: number;
  originalDocumentNumber: string | null;
};

export type DemandPlanningWizardBranch = {
  id: string;
  name: string;
  sapCode: string;
  dealerId: string | null;
  dealerName: string | null;
  frequency: string | null;
  dropsPerMonth: number;
};

export type DemandPlanningWizardDealer = {
  id: string;
  name: string;
  sapCode: string | null;
  branchCount: number;
};

export type DemandPlanningWizardPeriod = {
  id: string;
  label: string;
  isActive: boolean;
  startDate: string | null;
};

export type DemandPlanningSourcePreview = {
  branchCount: number;
  historyFrom: string;
  historyTo: string;
  historySkuCount: number;
  historyPeso: number;
  planogramYCount: number;
  planogramSkuCount: number;
  forecastUnitCount: number;
  forecastPeso: number;
  onHandUnitCount: number;
  onHandPeso: number;
  displayUnitsCount: number;
  onHandAsAt: string;
};
