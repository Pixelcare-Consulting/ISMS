import type { DemandPlanQuotaMode, PlanogramFlag } from "@/features/demand-planning/engine/demand-planning.types";

export type ReplenishmentPlanStatus = "generated" | "awaiting_history";

export type WorkbenchSkuFact = {
  modelId: string;
  skuCode: string;
  seriesCode: string;
  srp: number;
  planogramFlag: PlanogramFlag;
  historyQty: number;
  historyPeso: number;
  computedDisplayUnits: number;
  displayUnits: number;
  onHandQty: number;
  computedForecastQty: number;
  forecastQty: number;
};

export type WorkbenchReleasedRun = {
  id: string;
  documentNumber: string;
  periodId: string;
  periodLabel: string;
  runBranchId: string | null;
  planStatus: "planned" | "no_history" | "awaiting" | null;
};

export type WorkbenchBranchSnapshot = {
  branchId: string;
  sapCode: string;
  name: string;
  dealerName: string | null;
  periodId: string;
  periodLabel: string;
  dropsPerMonth: number;
  scheduleDropsPerMonth: number;
  quotaMode: DemandPlanQuotaMode;
  quotaPeso: number;
  monthBasisDays: number;
  roundUpToOne: boolean;
  floorAllocationAtZero: boolean;
  facts: WorkbenchSkuFact[];
  releasedRun: WorkbenchReleasedRun | null;
};

export type ReplenishmentMatrixRow = {
  branchId: string;
  sapCode: string;
  name: string;
  dealerName: string | null;
  planogramSkuCount: number;
  targetQty: number;
  targetPeso: number;
  shareOfNetwork: number;
  planStatus: ReplenishmentPlanStatus;
};

export type ReplenishmentMatrixView = {
  periods: Array<{ id: string; label: string; isActive: boolean }>;
  selectedPeriodId: string | null;
  periodLabel: string | null;
  releasedDocumentNumber: string | null;
  networkTargetPeso: number;
  networkTargetQty: number;
  generatedCount: number;
  awaitingCount: number;
  rows: ReplenishmentMatrixRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type WorkbenchSendResult = {
  orderId: string;
  orderNumber: string;
  lineCount: number;
  drop1Qty: number;
  skippedZeroCount: number;
};
