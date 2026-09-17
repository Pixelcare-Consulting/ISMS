import { auditService } from "@/features/audit/services/audit.service";
import { calendarMonthBoundsFromLabel } from "@/features/demand-planning/lib/planning-period-dates";
import { threeMonthHistoryWindow } from "@/features/demand-planning/lib/history-window";
import { parseRunParameters, parseRunScope } from "@/features/demand-planning/lib/run-snapshot";
import {
  skuInputFromPersistableLine,
  persistableBranchFromResult,
  type PersistableDemandLine,
} from "@/features/demand-planning/lib/line-mapper";
import { computeDemandPlan } from "@/features/demand-planning/engine/demand-planning.engine";
import { DEFAULT_DEMAND_PLAN_PARAMETERS } from "@/features/demand-planning/engine/demand-planning.constants";
import type { DemandPlanParameters } from "@/features/demand-planning/engine/demand-planning.types";
import { demandPlanningRepository } from "@/features/demand-planning/repositories/demand-planning.repository";
import { demandPlanningFactsRepository } from "@/features/demand-planning/repositories/demand-planning-facts.repository";
import {
  demandPlanningFactsService,
  type LineOverrideMap,
  type RunComputeParameters,
} from "@/features/demand-planning/services/demand-planning-facts.service";
import {
  toClientRun,
  toClientRunListItem,
  toGridLine,
  sumGridLineTotals,
} from "@/features/demand-planning/lib/client-mappers";
import type { GenerateDemandPlanInput } from "@/features/demand-planning/schemas/demand-planning-run.schema";
import type { DemandPlanningSourcePreview } from "@/features/demand-planning/types/run.types";
import { decimalToNumber } from "@/lib/database/decimal";
import type { PaginationInput } from "@/lib/shared/pagination";

function periodStartDate(period: {
  label: string;
  startDate: Date | null;
}): Date {
  if (period.startDate) return period.startDate;
  const fromLabel = calendarMonthBoundsFromLabel(period.label)?.startDate;
  if (fromLabel) return fromLabel;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function toClientRunWithOriginal(
  tenantId: string,
  run: NonNullable<Awaited<ReturnType<typeof demandPlanningRepository.findRunById>>>,
) {
  const originals = await demandPlanningRepository.originalDocumentNumbers(tenantId, [
    {
      id: run.id,
      documentNumber: run.documentNumber,
      supersedesRunId: run.supersedesRunId,
    },
  ]);
  return toClientRun({
    ...run,
    originalDocumentNumber: originals.get(run.id) ?? null,
  });
}

function toRunParameters(input: GenerateDemandPlanInput): RunComputeParameters {
  return {
    monthBasisDays: input.monthBasisDays,
    roundUpToOne: input.roundUpToOne,
    floorAllocationAtZero: input.floorAllocationAtZero,
    quotaMode: input.quotaMode,
    frequencyOverride: input.frequencyOverride,
  };
}

function engineParamsFromRunBranch(
  parameters: RunComputeParameters,
  branch: {
    dropsPerMonth: { toString(): string } | number;
    quotaPeso: { toString(): string } | number;
  },
): DemandPlanParameters {
  return {
    monthBasisDays: parameters.monthBasisDays || DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
    dropsPerMonth: decimalToNumber(branch.dropsPerMonth) || DEFAULT_DEMAND_PLAN_PARAMETERS.dropsPerMonth,
    roundUpToOne: parameters.roundUpToOne,
    floorAllocationAtZero: parameters.floorAllocationAtZero,
    quotaMode: parameters.quotaMode,
    quotaPeso:
      parameters.quotaMode === "branch_target"
        ? decimalToNumber(branch.quotaPeso)
        : undefined,
  };
}

export const demandPlanningRunService = {
  async listPeriods(tenantId: string) {
    const periods = await demandPlanningFactsRepository.listWizardPeriods(tenantId);
    return periods.map((period) => ({
      id: period.id,
      label: period.label,
      isActive: period.isActive,
    }));
  },

  async listWizardOptions(tenantId: string) {
    const [periods, dealers, branches] = await Promise.all([
      demandPlanningFactsRepository.listWizardPeriods(tenantId),
      demandPlanningFactsRepository.listWizardDealers(tenantId),
      demandPlanningFactsRepository.listWizardBranches(tenantId),
    ]);
    return {
      periods: periods.map((period) => ({
        id: period.id,
        label: period.label,
        isActive: period.isActive,
        startDate: period.startDate ? period.startDate.toISOString() : null,
      })),
      dealers: dealers.map((dealer) => ({
        id: dealer.id,
        name: dealer.name,
        sapCode: dealer.sapCode,
        branchCount: dealer._count.branches,
      })),
      branches,
    };
  },

  async listRuns(
    tenantId: string,
    pagination?: PaginationInput,
    filters?: { periodId?: string },
  ) {
    const result = await demandPlanningRepository.listRunsPaginated(
      tenantId,
      pagination,
      filters,
    );
    const originals = await demandPlanningRepository.originalDocumentNumbers(
      tenantId,
      result.items.map((item) => ({
        id: item.id,
        documentNumber: item.documentNumber,
        supersedesRunId: item.supersedesRunId,
      })),
    );
    return {
      ...result,
      items: result.items.map((item) =>
        toClientRunListItem({
          ...item,
          originalDocumentNumber: originals.get(item.id) ?? null,
        }),
      ),
    };
  },

  async getRun(tenantId: string, runId: string) {
    const run = await demandPlanningRepository.findRunById(tenantId, runId);
    if (!run) return null;
    return toClientRunWithOriginal(tenantId, run);
  },

  async getRunBranchGrid(tenantId: string, runId: string, runBranchId: string) {
    const run = await demandPlanningRepository.findRunById(tenantId, runId);
    if (!run) return null;
    const mappedRun = await toClientRunWithOriginal(tenantId, run);
    const branch = run.branches.find((item) => item.id === runBranchId) ?? run.branches[0];
    if (!branch) {
      return { run: mappedRun, branchId: null, lines: [], totals: sumGridLineTotals([]) };
    }
    const lines = await demandPlanningRepository.listLinesForRunBranch(tenantId, branch.id);
    const mapped = lines.map(toGridLine);
    return {
      run: mappedRun,
      branchId: branch.id,
      lines: mapped,
      totals: sumGridLineTotals(mapped),
    };
  },

  async previewSources(
    tenantId: string,
    input: GenerateDemandPlanInput,
  ): Promise<DemandPlanningSourcePreview> {
    const period = await demandPlanningFactsRepository.findPeriod(tenantId, input.periodId);
    if (!period) throw new Error("Planning period not found");
    await demandPlanningRepository.applyPeriodCalendarDates(tenantId, period.id, period.label);
    const start = periodStartDate(period);
    const { historyFrom, historyTo } = threeMonthHistoryWindow(start);
    const { assembled, stamps, onHandAsAt } = await demandPlanningFactsService.assembleBranches({
      tenantId,
      periodId: period.id,
      branchIds: input.branchIds,
      historyFrom,
      historyTo,
      parameters: toRunParameters(input),
    });
    return {
      branchCount: assembled.length,
      historyFrom: historyFrom.toISOString(),
      historyTo: historyTo.toISOString(),
      historySkuCount: stamps.historySkuCount,
      historyPeso: stamps.historyPeso,
      planogramYCount: stamps.planogramYCount,
      planogramSkuCount: stamps.planogramSkuCount,
      forecastUnitCount: stamps.forecastUnitCount,
      forecastPeso: stamps.forecastPeso,
      onHandUnitCount: stamps.onHandUnitCount,
      onHandPeso: stamps.onHandPeso,
      displayUnitsCount: stamps.displayUnitsCount,
      onHandAsAt: onHandAsAt.toISOString(),
    };
  },

  async generateRun(
    tenantId: string,
    actorUserId: string,
    input: GenerateDemandPlanInput,
  ) {
    const period = await demandPlanningFactsRepository.findPeriod(tenantId, input.periodId);
    if (!period) throw new Error("Planning period not found");
    await demandPlanningRepository.applyPeriodCalendarDates(tenantId, period.id, period.label);

    const branches = await demandPlanningFactsRepository.listActiveBranchesByIds(
      tenantId,
      input.branchIds,
    );
    if (branches.length === 0) throw new Error("No active branches in scope");

    let version = 1;
    if (input.supersedesRunId) {
      const previous = await demandPlanningRepository.findRunById(tenantId, input.supersedesRunId);
      if (!previous || previous.tenantId !== tenantId) {
        throw new Error("Previous run not found");
      }
      version = previous.version + 1;
    }

    const start = periodStartDate(period);
    const { historyFrom, historyTo } = threeMonthHistoryWindow(start);
    const documentNumber = await demandPlanningRepository.nextDocumentNumber(tenantId, start);
    const parameters = toRunParameters(input);
    const scope = {
      dealerIds: input.dealerIds,
      branchIds: branches.map((branch) => branch.id),
    };

    const run = await demandPlanningRepository.createRun(tenantId, {
      periodId: period.id,
      documentNumber,
      version,
      status: "draft",
      name: input.name?.trim() || null,
      scope,
      parameters,
      historyFrom,
      historyTo,
      createdById: actorUserId,
      supersedesRunId: input.supersedesRunId ?? null,
    });

    const { assembled, stamps, onHandAsAt } = await demandPlanningFactsService.assembleBranches({
      tenantId,
      periodId: period.id,
      branchIds: scope.branchIds,
      historyFrom,
      historyTo,
      parameters,
    });
    const persistable = demandPlanningFactsService.computePersistableBranches(
      assembled,
      parameters,
    );

    await demandPlanningRepository.replaceRunComputation(tenantId, run.id, {
      status: "generated",
      historyFrom,
      historyTo,
      onHandAsAt,
      stamps,
      branches: persistable,
    });

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "demand_planning.run_generated",
      entityType: "DemandPlanningRun",
      entityId: run.id,
      metadata: {
        documentNumber,
        branchCount: persistable.length,
        plannedCount: persistable.filter((branch) => branch.planStatus === "planned").length,
      },
    });

    return { runId: run.id, documentNumber };
  },

  async recalculateRun(tenantId: string, actorUserId: string, runId: string) {
    const run = await demandPlanningRepository.findRunById(tenantId, runId);
    if (!run) throw new Error("Demand planning run not found");

    if (run.status === "released") {
      const scope = parseRunScope(run.scope);
      const parameters = parseRunParameters(run.parameters);
      return this.generateRun(tenantId, actorUserId, {
        periodId: run.periodId,
        name: run.name,
        dealerIds: scope.dealerIds,
        branchIds: scope.branchIds.length > 0 ? scope.branchIds : run.branches.map((b) => b.branchId),
        monthBasisDays: parameters.monthBasisDays,
        roundUpToOne: parameters.roundUpToOne,
        floorAllocationAtZero: parameters.floorAllocationAtZero,
        quotaMode: parameters.quotaMode,
        frequencyOverride: parameters.frequencyOverride,
        supersedesRunId: run.id,
      });
    }

    if (run.status === "superseded") {
      throw new Error("This plan was replaced by a newer version");
    }

    const parameters = parseRunParameters(run.parameters);
    const existingLines = await demandPlanningRepository.listLinesForRun(tenantId, run.id);
    const overridesByBranch = new Map<string, LineOverrideMap>();
    const branchIdByRunBranch = new Map(run.branches.map((branch) => [branch.id, branch.branchId]));
    for (const line of existingLines) {
      const branchId = branchIdByRunBranch.get(line.runBranchId);
      if (!branchId) continue;
      const map = overridesByBranch.get(branchId) ?? new Map();
      map.set(line.modelId, {
        displayUnits: line.displayUnits,
        forecastQty: line.forecastQty,
      });
      overridesByBranch.set(branchId, map);
    }

    const start = periodStartDate(run.period);
    const { historyFrom, historyTo } = threeMonthHistoryWindow(start);
    const { assembled, stamps, onHandAsAt } = await demandPlanningFactsService.assembleBranches({
      tenantId,
      periodId: run.periodId,
      branchIds: run.branches.map((branch) => branch.branchId),
      historyFrom,
      historyTo,
      parameters,
      overridesByBranch,
    });
    const persistable = demandPlanningFactsService.computePersistableBranches(
      assembled,
      parameters,
    );

    await demandPlanningRepository.replaceRunComputation(tenantId, run.id, {
      status: "generated",
      historyFrom,
      historyTo,
      onHandAsAt,
      stamps,
      branches: persistable,
    });

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "demand_planning.run_recalculated",
      entityType: "DemandPlanningRun",
      entityId: run.id,
      metadata: { documentNumber: run.documentNumber },
    });

    return { runId: run.id, documentNumber: run.documentNumber };
  },

  async applyLineOverride(
    tenantId: string,
    actorUserId: string,
    input: { runId: string; lineId: string; field: "displayUnits" | "forecastQty"; value: number },
  ) {
    const line = await demandPlanningRepository.findLineById(tenantId, input.lineId);
    if (!line || line.runId !== input.runId) throw new Error("Planning line not found");
    if (line.run.status === "released" || line.run.status === "superseded") {
      throw new Error("Released plans are frozen. Recalculate to start a new version.");
    }

    const before =
      input.field === "displayUnits" ? String(line.displayUnits) : String(line.forecastQty);
    const after = String(input.value);

    await demandPlanningRepository.createOverride({
      tenantId,
      runId: line.runId,
      runBranchId: line.runBranchId,
      lineId: line.id,
      userId: actorUserId,
      field: input.field,
      beforeValue: before,
      afterValue: after,
    });

    const siblingLines = await demandPlanningRepository.listLinesForRunBranch(
      tenantId,
      line.runBranchId,
    );
    const persistableLines: PersistableDemandLine[] = siblingLines.map((row) => ({
      modelId: row.modelId,
      skuCode: row.skuCode,
      seriesCode: row.seriesCode,
      srp: decimalToNumber(row.srp),
      planogramFlag: row.planogramFlag,
      historyQty: decimalToNumber(row.historyQty),
      historyPeso: decimalToNumber(row.historyPeso),
      hmix: decimalToNumber(row.hmix),
      adjHmix: decimalToNumber(row.adjHmix),
      milQty: row.milQty,
      milPeso: decimalToNumber(row.milPeso),
      computedDisplayUnits: row.computedDisplayUnits,
      displayUnits: row.id === line.id && input.field === "displayUnits" ? input.value : row.displayUnits,
      onHandQty: row.onHandQty,
      computedForecastQty: row.computedForecastQty,
      forecastQty: row.id === line.id && input.field === "forecastQty" ? input.value : row.forecastQty,
      forecastPeso: decimalToNumber(row.forecastPeso),
      allocQty: row.allocQty,
      allocPeso: decimalToNumber(row.allocPeso),
      cycleQty: row.cycleQty,
      computedDrop1Qty: row.computedDrop1Qty,
      drop1Peso: decimalToNumber(row.drop1Peso),
      totalInventoryQty: row.totalInventoryQty,
      totalInventoryPeso: decimalToNumber(row.totalInventoryPeso),
    }));

    const parameters = parseRunParameters(line.run.parameters);
    const skus = persistableLines.map(skuInputFromPersistableLine);
    const result = computeDemandPlan({
      parameters: engineParamsFromRunBranch(parameters, line.runBranch),
      skus,
    });
    const computedBySku = new Map(
      persistableLines.map((row) => [
        row.skuCode,
        { displayUnits: row.computedDisplayUnits, forecastQty: row.computedForecastQty },
      ]),
    );
    const modelIdBySku = new Map(persistableLines.map((row) => [row.skuCode, row.modelId]));
    const persistable = persistableBranchFromResult({
      branchId: line.runBranch.branchId,
      result,
      modelIdBySku,
      computedBySku,
    });

    await demandPlanningRepository.replaceRunBranchComputation(
      tenantId,
      line.runId,
      line.runBranchId,
      persistable,
    );

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "demand_planning.line_overridden",
      entityType: "DemandPlanningLine",
      entityId: line.id,
      metadata: { field: input.field, before, after },
    });

    const refreshed = await demandPlanningRepository.listLinesForRunBranch(
      tenantId,
      line.runBranchId,
    );
    return refreshed.map(toGridLine);
  },

  async exportRunCsv(tenantId: string, runId: string) {
    const run = await demandPlanningRepository.findRunById(tenantId, runId);
    if (!run) throw new Error("Demand planning run not found");
    const lines = await demandPlanningRepository.listLinesForRun(tenantId, runId);
    const branchLabel = new Map(
      run.branches.map((branch) => [branch.id, `${branch.branch.sapCode} ${branch.branch.name}`]),
    );
    return {
      documentNumber: run.documentNumber,
      rows: lines.map((line) => ({
        ...toGridLine(line),
        branchLabel: branchLabel.get(line.runBranchId) ?? "",
      })),
    };
  },
};
