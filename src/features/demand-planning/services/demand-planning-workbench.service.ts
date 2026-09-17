import { auditService } from "@/features/audit/services/audit.service";
import { DEFAULT_DEMAND_PLAN_PARAMETERS } from "@/features/demand-planning/engine/demand-planning.constants";
import { calendarMonthBoundsFromLabel } from "@/features/demand-planning/lib/planning-period-dates";
import { threeMonthHistoryWindow } from "@/features/demand-planning/lib/history-window";
import { parseRunParameters } from "@/features/demand-planning/lib/run-snapshot";
import { planogramFlagFor } from "@/features/demand-planning/lib/planogram-flag";
import { computeWorkbenchGrid } from "@/features/demand-planning/lib/workbench-grid";
import {
  orderDetailsFromSelectedDrop1,
  workbenchOverrideDiffs,
} from "@/features/demand-planning/lib/workbench-send";
import { demandPlanningFactsRepository } from "@/features/demand-planning/repositories/demand-planning-facts.repository";
import { demandPlanningRepository } from "@/features/demand-planning/repositories/demand-planning.repository";
import { demandPlanningFactsService } from "@/features/demand-planning/services/demand-planning-facts.service";
import type { SendWorkbenchInput } from "@/features/demand-planning/schemas/demand-planning-workbench.schema";
import type {
  ReplenishmentMatrixRow,
  ReplenishmentMatrixView,
  ReplenishmentPlanStatus,
  WorkbenchBranchSnapshot,
  WorkbenchSkuFact,
} from "@/features/demand-planning/types/workbench.types";
import { getOrderApprovalChain } from "@/features/orders/constants/order-workflow";
import { nextSalesOrderNumber } from "@/features/orders/utils/next-sales-order-number";
import { decimalToNumber } from "@/lib/database/decimal";
import { prisma } from "@/lib/database/client";
import type { PaginationInput } from "@/lib/shared/pagination";

function periodStartDate(period: { label: string; startDate: Date | null }): Date {
  if (period.startDate) return period.startDate;
  const fromLabel = calendarMonthBoundsFromLabel(period.label)?.startDate;
  if (fromLabel) return fromLabel;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function resolvePeriod(tenantId: string, periodId?: string) {
  const periods = await demandPlanningFactsRepository.listWizardPeriods(tenantId);
  const selected =
    (periodId ? periods.find((period) => period.id === periodId) : null) ??
    periods.find((period) => period.isActive) ??
    periods[0] ??
    null;
  return { periods, selected };
}

function matrixPlanStatus(input: {
  runStatus: "planned" | "no_history" | "awaiting" | undefined;
  hasHistory: boolean;
}): ReplenishmentPlanStatus {
  if (input.runStatus === "planned") return "generated";
  if (input.runStatus === "no_history" || input.runStatus === "awaiting") return "awaiting_history";
  return input.hasHistory ? "generated" : "awaiting_history";
}

export const demandPlanningWorkbenchService = {
  async listMatrix(
    tenantId: string,
    input?: { periodId?: string; q?: string } & PaginationInput,
  ): Promise<ReplenishmentMatrixView> {
    const { periods, selected } = await resolvePeriod(tenantId, input?.periodId);
    const empty: ReplenishmentMatrixView = {
      periods: periods.map((period) => ({
        id: period.id,
        label: period.label,
        isActive: period.isActive,
      })),
      selectedPeriodId: selected?.id ?? null,
      periodLabel: selected?.label ?? null,
      releasedDocumentNumber: null,
      networkTargetPeso: 0,
      networkTargetQty: 0,
      generatedCount: 0,
      awaitingCount: 0,
      rows: [],
      total: 0,
      page: 1,
      limit: input?.limit ?? 25,
      totalPages: 1,
    };
    if (!selected) return empty;

    await demandPlanningRepository.applyPeriodCalendarDates(tenantId, selected.id, selected.label);
    const start = periodStartDate(selected);
    const { historyFrom, historyTo } = threeMonthHistoryWindow(start);

    const [page, forecasts, targets, soldStatusIds, planRun, released] = await Promise.all([
      demandPlanningFactsRepository.listActiveBranchesPaginated(
        tenantId,
        { page: input?.page, limit: input?.limit },
        { q: input?.q },
      ),
      demandPlanningFactsRepository.listSkuForecastsWithSrp(tenantId, selected.id),
      demandPlanningFactsRepository.listAllBranchTargets(tenantId, selected.id),
      demandPlanningFactsRepository.listSoldStatusIds(tenantId),
      demandPlanningRepository.findLatestPlanRunForPeriod(tenantId, selected.id),
      demandPlanningRepository.findLatestReleasedRunForPeriod(tenantId, selected.id),
    ]);

    const branchIds = page.items.map((row) => row.id);
    const [planogramCounts, historyBranchIds] = await Promise.all([
      demandPlanningFactsRepository.countPlanogramSkusByBranch(tenantId, branchIds),
      demandPlanningFactsRepository.listBranchIdsWithHistory(
        tenantId,
        branchIds,
        soldStatusIds,
        historyFrom,
        historyTo,
      ),
    ]);

    const forecastByBranch = new Map<string, { qty: number; peso: number }>();
    let networkTargetQty = 0;
    let networkForecastPeso = 0;
    for (const row of forecasts) {
      const current = forecastByBranch.get(row.branchId) ?? { qty: 0, peso: 0 };
      current.qty += row.qty;
      current.peso += row.qty * decimalToNumber(row.model.srp);
      forecastByBranch.set(row.branchId, current);
      networkTargetQty += row.qty;
      networkForecastPeso += row.qty * decimalToNumber(row.model.srp);
    }

    const targetByBranch = new Map<string, number>();
    let networkBranchTargetPeso = 0;
    for (const row of targets) {
      const peso = decimalToNumber(row.revenueTarget);
      targetByBranch.set(row.branchId, peso);
      networkBranchTargetPeso += peso;
    }

    const networkTargetPeso =
      networkForecastPeso > 0 ? networkForecastPeso : networkBranchTargetPeso;

    const planogramByBranch = new Map(
      planogramCounts.map((row) => [row.branchId, row._count._all]),
    );
    const historySet = new Set(historyBranchIds);
    const runStatusByBranch = new Map(
      (planRun?.branches ?? []).map((branch) => [branch.branchId, branch.planStatus]),
    );

    const rows: ReplenishmentMatrixRow[] = page.items.map((branch) => {
      const forecast = forecastByBranch.get(branch.id);
      const targetPeso =
        (forecast?.peso ?? 0) > 0 ? forecast!.peso : (targetByBranch.get(branch.id) ?? 0);
      const targetQty = forecast?.qty ?? 0;
      return {
        branchId: branch.id,
        sapCode: branch.sapCode,
        name: branch.name,
        dealerName: branch.dealerName,
        planogramSkuCount: planogramByBranch.get(branch.id) ?? 0,
        targetQty,
        targetPeso,
        shareOfNetwork: networkTargetPeso > 0 ? targetPeso / networkTargetPeso : 0,
        planStatus: matrixPlanStatus({
          runStatus: runStatusByBranch.get(branch.id),
          hasHistory: historySet.has(branch.id),
        }),
      };
    });

    const generatedCount = planRun
      ? planRun.branches.filter((branch) => branch.planStatus === "planned").length
      : rows.filter((row) => row.planStatus === "generated").length;
    const awaitingCount = planRun
      ? planRun.branches.filter((branch) => branch.planStatus !== "planned").length
      : rows.filter((row) => row.planStatus === "awaiting_history").length;

    return {
      periods: empty.periods,
      selectedPeriodId: selected.id,
      periodLabel: selected.label,
      releasedDocumentNumber: released?.documentNumber ?? null,
      networkTargetPeso,
      networkTargetQty,
      generatedCount,
      awaitingCount,
      rows,
      total: page.total,
      page: page.page,
      limit: page.limit,
      totalPages: page.totalPages,
    };
  },

  async getWorkbench(
    tenantId: string,
    branchId: string,
    periodId?: string,
  ): Promise<WorkbenchBranchSnapshot> {
    const { selected } = await resolvePeriod(tenantId, periodId);
    if (!selected) throw new Error("No planning period is set up yet");

    const branch = await demandPlanningFactsRepository.findActiveBranch(tenantId, branchId);
    if (!branch) throw new Error("Branch not found");

    await demandPlanningRepository.applyPeriodCalendarDates(tenantId, selected.id, selected.label);
    const start = periodStartDate(selected);
    const { historyFrom, historyTo } = threeMonthHistoryWindow(start);
    const parameters = {
      monthBasisDays: DEFAULT_DEMAND_PLAN_PARAMETERS.monthBasisDays,
      roundUpToOne: DEFAULT_DEMAND_PLAN_PARAMETERS.roundUpToOne,
      floorAllocationAtZero: DEFAULT_DEMAND_PLAN_PARAMETERS.floorAllocationAtZero,
      quotaMode: DEFAULT_DEMAND_PLAN_PARAMETERS.quotaMode,
      frequencyOverride: null as number | null,
    };

    const [assembledResult, released, targets] = await Promise.all([
      demandPlanningFactsService.assembleBranches({
        tenantId,
        periodId: selected.id,
        branchIds: [branchId],
        historyFrom,
        historyTo,
        parameters,
      }),
      demandPlanningRepository.findLatestReleasedRunForPeriod(tenantId, selected.id),
      demandPlanningFactsRepository.listBranchTargets(tenantId, selected.id, [branchId]),
    ]);

    const assembled = assembledResult.assembled[0];
    if (!assembled) throw new Error("Could not load replenishment facts for this branch");

    const releasedBranch = released?.branches.find((row) => row.branchId === branchId) ?? null;
    const releasedParameters = released ? parseRunParameters(released.parameters) : parameters;
    const scheduleDrops = assembled.dropsPerMonth;
    const dropsPerMonth = releasedBranch
      ? decimalToNumber(releasedBranch.dropsPerMonth) || scheduleDrops
      : scheduleDrops;
    const quotaPeso = releasedBranch
      ? decimalToNumber(releasedBranch.quotaPeso)
      : assembled.quotaPeso ?? decimalToNumber(targets[0]?.revenueTarget) ?? 0;

    const facts: WorkbenchSkuFact[] = assembled.facts.map((fact) => {
      const computed = assembled.computedBySku.get(fact.skuCode);
      return {
        modelId: fact.modelId,
        skuCode: fact.skuCode,
        seriesCode: fact.series,
        srp: fact.srp,
        planogramFlag: planogramFlagFor({
          hasPlanogramRow: fact.hasPlanogram,
          srp: fact.srp,
        }),
        historyQty: fact.historyQty,
        historyPeso: fact.historyPeso,
        computedDisplayUnits: computed?.displayUnits ?? 0,
        displayUnits: fact.displayUnits,
        onHandQty: fact.onHandQty,
        computedForecastQty: computed?.forecastQty ?? fact.forecastQty,
        forecastQty: fact.forecastQty,
      };
    });

    return {
      branchId: branch.id,
      sapCode: branch.sapCode,
      name: branch.name,
      dealerName: branch.dealer?.name ?? null,
      periodId: selected.id,
      periodLabel: selected.label,
      dropsPerMonth,
      scheduleDropsPerMonth: scheduleDrops,
      quotaMode: releasedParameters.quotaMode,
      quotaPeso,
      monthBasisDays: releasedParameters.monthBasisDays,
      roundUpToOne: releasedParameters.roundUpToOne,
      floorAllocationAtZero: releasedParameters.floorAllocationAtZero,
      facts,
      releasedRun: released
        ? {
            id: released.id,
            documentNumber: released.documentNumber,
            periodId: released.periodId,
            periodLabel: released.period.label,
            runBranchId: releasedBranch?.id ?? null,
            planStatus: releasedBranch?.planStatus ?? null,
          }
        : null,
    };
  },

  async sendSupplementary(tenantId: string, actorUserId: string, input: SendWorkbenchInput) {
    const released = await demandPlanningRepository.findLatestReleasedRunForPeriod(
      tenantId,
      input.periodId,
    );
    if (!released) {
      throw new Error(
        "Release a Demand Planning run for this period before sending a supplementary order.",
      );
    }

    const snapshot = await this.getWorkbench(tenantId, input.branchId, input.periodId);
    const overrideByModel = new Map(
      input.overrides.map((row) => [row.modelId, row] as const),
    );
    const facts = snapshot.facts.map((fact) => {
      const override = overrideByModel.get(fact.modelId);
      if (!override) return fact;
      return {
        ...fact,
        displayUnits: override.displayUnits,
        forecastQty: override.forecastQty,
      };
    });

    const { result } = computeWorkbenchGrid({
      facts,
      dropsPerMonth: input.dropsPerMonth,
      quotaMode: input.quotaMode,
      quotaPeso: input.quotaPeso,
      monthBasisDays: snapshot.monthBasisDays,
      roundUpToOne: snapshot.roundUpToOne,
      floorAllocationAtZero: snapshot.floorAllocationAtZero,
    });

    const factBySku = new Map(facts.map((fact) => [fact.skuCode, fact]));
    const sendLines = result.lines.flatMap((line) => {
      const fact = factBySku.get(line.sku);
      if (!fact) return [];
      return [{ modelId: fact.modelId, computedDrop1Qty: line.drop1Qty }];
    });
    const { details, skippedZeroCount } = orderDetailsFromSelectedDrop1(
      sendLines,
      input.selectedModelIds,
    );
    if (details.length === 0) {
      throw new Error("No Drop 1 quantity to send. Select SKUs with a positive suggested qty.");
    }

    const orderNumber = await nextSalesOrderNumber(tenantId);
    const approvalChain = getOrderApprovalChain("auto_replenish");
    const drop1Qty = details.reduce((sum, line) => sum + line.quantity, 0);
    const order = await prisma.branchOrder.create({
      data: {
        tenantId,
        branchId: input.branchId,
        orderType: "auto_replenish",
        orderNumber,
        status: "draft",
        createdById: actorUserId,
        notes: `Supplementary Demand Planning ${released.documentNumber} (${released.period.label}) — workbench`,
        details: {
          create: details.map((detail) => ({
            modelId: detail.modelId,
            quantity: detail.quantity,
          })),
        },
        approvalLevels: {
          create: approvalChain.map((step) => ({
            level: step.level,
            roleSlug: step.roleSlug,
          })),
        },
      },
    });

    const persistedLines = snapshot.releasedRun?.runBranchId
      ? await demandPlanningRepository.listLineIdsForRunBranch(
          tenantId,
          released.id,
          input.branchId,
        )
      : [];
    const lineIdByModel = new Map(persistedLines.map((line) => [line.modelId, line]));
    const diffs = workbenchOverrideDiffs({ facts: snapshot.facts, overrides: input.overrides });
    const runBranchId = snapshot.releasedRun?.runBranchId ?? persistedLines[0]?.runBranchId ?? null;

    await demandPlanningRepository.createOverridesMany([
      ...diffs.map((diff) => ({
        tenantId,
        runId: released.id,
        runBranchId,
        lineId: lineIdByModel.get(diff.modelId)?.id ?? null,
        userId: actorUserId,
        field: diff.field,
        beforeValue: diff.beforeValue,
        afterValue: diff.afterValue,
      })),
      {
        tenantId,
        runId: released.id,
        runBranchId,
        lineId: null,
        userId: actorUserId,
        field: "supplementary_send",
        beforeValue: "0",
        afterValue: JSON.stringify({
          orderNumber,
          drop1Qty,
          lineCount: details.length,
        }),
      },
    ]);

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "demand_planning.workbench_sent",
      entityType: "DemandPlanningRun",
      entityId: released.id,
      metadata: {
        documentNumber: released.documentNumber,
        orderNumber,
        branchId: input.branchId,
        lineCount: details.length,
        drop1Qty,
        skippedZeroCount,
      },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      lineCount: details.length,
      drop1Qty,
      skippedZeroCount,
    };
  },
};
