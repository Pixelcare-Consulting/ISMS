import type { DemandPlanningRunStatus, Prisma } from "@prisma/client";

import { periodDateFieldsFromLabel } from "@/features/demand-planning/lib/planning-period-dates";
import { formatDemandPlanningDocumentNumber } from "@/features/demand-planning/lib/document-number";
import type { PersistableRunBranch } from "@/features/demand-planning/lib/line-mapper";
import { ORDER_QUEUE_STATUSES } from "@/features/orders/constants/order-workflow";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";
import { prisma } from "@/lib/database/client";

export type SkuForecastUpsert = {
  periodId: string;
  branchId: string;
  modelId: string;
  qty: number;
};

export const demandPlanningRepository = {
  async applyPeriodCalendarDates(tenantId: string, periodId: string, label: string) {
    const dates = periodDateFieldsFromLabel(label);
    if (!("startDate" in dates)) return null;
    const period = await prisma.planningPeriod.findFirst({
      where: { id: periodId, tenantId },
      select: { id: true },
    });
    if (!period) return null;
    return prisma.planningPeriod.update({
      where: { id: period.id },
      data: { startDate: dates.startDate, endDate: dates.endDate },
    });
  },

  listSkuForecastsForPeriod(tenantId: string, periodId: string) {
    return prisma.skuForecastTarget.findMany({
      where: { tenantId, periodId },
      include: {
        branch: { select: { id: true, sapCode: true, name: true } },
        model: { select: { id: true, skuCode: true, name: true, srp: true } },
      },
      orderBy: [{ branch: { sapCode: "asc" } }, { model: { skuCode: "asc" } }],
    });
  },

  findSkuForecast(tenantId: string, periodId: string, branchId: string, modelId: string) {
    return prisma.skuForecastTarget.findFirst({
      where: { tenantId, periodId, branchId, modelId },
    });
  },

  upsertSkuForecast(tenantId: string, input: SkuForecastUpsert) {
    return prisma.skuForecastTarget.upsert({
      where: {
        periodId_branchId_modelId: {
          periodId: input.periodId,
          branchId: input.branchId,
          modelId: input.modelId,
        },
      },
      create: {
        tenantId,
        periodId: input.periodId,
        branchId: input.branchId,
        modelId: input.modelId,
        qty: input.qty,
      },
      update: { qty: input.qty },
    });
  },

  async nextDocumentNumber(tenantId: string, periodStart: Date): Promise<string> {
    const year = periodStart.getUTCFullYear();
    const month = String(periodStart.getUTCMonth() + 1).padStart(2, "0");
    const prefix = `DP-${year}${month}-`;
    const latest = await prisma.demandPlanningRun.findFirst({
      where: { tenantId, documentNumber: { startsWith: prefix } },
      orderBy: { documentNumber: "desc" },
      select: { documentNumber: true },
    });
    const lastSeq = latest
      ? Number.parseInt(latest.documentNumber.slice(prefix.length), 10)
      : 0;
    const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
    return formatDemandPlanningDocumentNumber(periodStart, nextSeq);
  },

  createRun(
    tenantId: string,
    data: {
      periodId: string;
      documentNumber: string;
      version?: number;
      status?: DemandPlanningRunStatus;
      name?: string | null;
      scope: Prisma.InputJsonValue;
      parameters: Prisma.InputJsonValue;
      historyFrom?: Date | null;
      historyTo?: Date | null;
      createdById: string;
      supersedesRunId?: string | null;
    },
  ) {
    return prisma.demandPlanningRun.create({
      data: {
        tenantId,
        periodId: data.periodId,
        documentNumber: data.documentNumber,
        version: data.version ?? 1,
        status: data.status ?? "draft",
        name: data.name,
        scope: data.scope,
        parameters: data.parameters,
        historyFrom: data.historyFrom,
        historyTo: data.historyTo,
        createdById: data.createdById,
        supersedesRunId: data.supersedesRunId,
      },
    });
  },

  listRunsForPeriod(tenantId: string, periodId: string) {
    return prisma.demandPlanningRun.findMany({
      where: { tenantId, periodId },
      include: {
        _count: { select: { branches: true, lines: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });
  },

  async listRunsPaginated(
    tenantId: string,
    pagination?: PaginationInput,
    filters?: { periodId?: string },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where = {
      tenantId,
      ...(filters?.periodId ? { periodId: filters.periodId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.demandPlanningRun.findMany({
        where,
        include: {
          period: { select: { label: true } },
          createdBy: { select: { name: true, email: true } },
          branches: {
            select: {
              planStatus: true,
              drop1Qty: true,
              drop1Peso: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.demandPlanningRun.count({ where }),
    ]);

    return toPaginatedResult(items, total, page, limit);
  },

  findRunById(tenantId: string, runId: string) {
    return prisma.demandPlanningRun.findFirst({
      where: { id: runId, tenantId },
      include: {
        period: { select: { id: true, label: true, startDate: true, endDate: true } },
        branches: {
          include: {
            branch: { select: { id: true, sapCode: true, name: true, dealerId: true } },
          },
          orderBy: { branch: { sapCode: "asc" } },
        },
      },
    });
  },

  listLinesForRunBranch(tenantId: string, runBranchId: string) {
    return prisma.demandPlanningLine.findMany({
      where: { tenantId, runBranchId },
      orderBy: { skuCode: "asc" },
    });
  },

  listLinesForRun(tenantId: string, runId: string) {
    return prisma.demandPlanningLine.findMany({
      where: { tenantId, runId },
      orderBy: [{ skuCode: "asc" }],
    });
  },

  findLineById(tenantId: string, lineId: string) {
    return prisma.demandPlanningLine.findFirst({
      where: { id: lineId, tenantId },
      include: {
        run: { select: { id: true, status: true, parameters: true } },
        runBranch: true,
      },
    });
  },

  createOverride(input: {
    tenantId: string;
    runId: string;
    runBranchId?: string | null;
    lineId?: string | null;
    userId: string;
    field: string;
    beforeValue: string;
    afterValue: string;
  }) {
    return prisma.demandPlanningOverride.create({
      data: input,
    });
  },

  /**
   * Open Auto Replenish for the branch scoped to the same planning period.
   * Matches notes that include `(periodLabel)` (DP release convention) or the run
   * `documentNumber`. Manual Auto Replenish without period notes do not match.
   */
  findExistingOpenAutoReplenish(
    tenantId: string,
    branchId: string,
    periodLabel: string | null | undefined,
    documentNumber?: string | null,
  ) {
    const label = periodLabel?.trim() ?? "";
    if (!label) return Promise.resolve(null);

    const periodToken = `(${label})`;
    const notesFilters: Prisma.BranchOrderWhereInput[] = [
      { notes: { contains: periodToken, mode: "insensitive" } },
    ];
    const doc = documentNumber?.trim() ?? "";
    if (doc) {
      notesFilters.push({ notes: { contains: doc, mode: "insensitive" } });
    }

    return prisma.branchOrder.findFirst({
      where: {
        tenantId,
        branchId,
        orderType: "auto_replenish",
        status: { in: [...ORDER_QUEUE_STATUSES] },
        OR: notesFilters,
      },
      select: { id: true, orderNumber: true, status: true, notes: true },
    });
  },

  async replaceRunComputation(
    tenantId: string,
    runId: string,
    input: {
      status: DemandPlanningRunStatus;
      historyFrom: Date;
      historyTo: Date;
      onHandAsAt: Date;
      stamps: {
        historySkuCount: number;
        historyPeso: number;
        planogramYCount: number;
        planogramSkuCount: number;
        forecastUnitCount: number;
        forecastPeso: number;
        onHandUnitCount: number;
        onHandPeso: number;
        displayUnitsCount: number;
      };
      branches: PersistableRunBranch[];
    },
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.demandPlanningRunBranch.deleteMany({ where: { tenantId, runId } });

      for (const branch of input.branches) {
        const created = await tx.demandPlanningRunBranch.create({
          data: {
            tenantId,
            runId,
            branchId: branch.branchId,
            planStatus: branch.planStatus,
            quotaPeso: branch.quotaPeso,
            minLevelDays: branch.minLevelDays,
            minLevelPeso: branch.minLevelPeso,
            dropsPerMonth: branch.dropsPerMonth,
            historyQty: branch.historyQty,
            historyPeso: branch.historyPeso,
            milQty: branch.milQty,
            milPeso: branch.milPeso,
            displayUnits: branch.displayUnits,
            onHandQty: branch.onHandQty,
            forecastQty: branch.forecastQty,
            forecastPeso: branch.forecastPeso,
            allocQty: branch.allocQty,
            allocPeso: branch.allocPeso,
            drop1Qty: branch.drop1Qty,
            drop1Peso: branch.drop1Peso,
            cycleQty: branch.cycleQty,
            planogramSkuCount: branch.planogramSkuCount,
            coverageDays: branch.coverageDays,
          },
        });

        if (branch.lines.length === 0) continue;

        await tx.demandPlanningLine.createMany({
          data: branch.lines.map((line) => ({
            tenantId,
            runId,
            runBranchId: created.id,
            modelId: line.modelId,
            skuCode: line.skuCode,
            seriesCode: line.seriesCode,
            srp: line.srp,
            planogramFlag: line.planogramFlag,
            historyQty: line.historyQty,
            historyPeso: line.historyPeso,
            hmix: line.hmix,
            adjHmix: line.adjHmix,
            milQty: line.milQty,
            milPeso: line.milPeso,
            computedDisplayUnits: line.computedDisplayUnits,
            displayUnits: line.displayUnits,
            onHandQty: line.onHandQty,
            computedForecastQty: line.computedForecastQty,
            forecastQty: line.forecastQty,
            forecastPeso: line.forecastPeso,
            allocQty: line.allocQty,
            allocPeso: line.allocPeso,
            cycleQty: line.cycleQty,
            computedDrop1Qty: line.computedDrop1Qty,
            drop1Peso: line.drop1Peso,
            totalInventoryQty: line.totalInventoryQty,
            totalInventoryPeso: line.totalInventoryPeso,
          })),
        });
      }

      await tx.demandPlanningRun.update({
        where: { id: runId },
        data: {
          status: input.status,
          historyFrom: input.historyFrom,
          historyTo: input.historyTo,
          onHandAsAt: input.onHandAsAt,
          historySkuCount: input.stamps.historySkuCount,
          historyPeso: input.stamps.historyPeso,
          planogramYCount: input.stamps.planogramYCount,
          planogramSkuCount: input.stamps.planogramSkuCount,
          forecastUnitCount: input.stamps.forecastUnitCount,
          forecastPeso: input.stamps.forecastPeso,
          onHandUnitCount: input.stamps.onHandUnitCount,
          onHandPeso: input.stamps.onHandPeso,
          displayUnitsCount: input.stamps.displayUnitsCount,
        },
      });
    });
  },

  async replaceRunBranchComputation(
    tenantId: string,
    runId: string,
    runBranchId: string,
    branch: PersistableRunBranch,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.demandPlanningLine.deleteMany({ where: { tenantId, runBranchId } });
      await tx.demandPlanningRunBranch.update({
        where: { id: runBranchId },
        data: {
          planStatus: branch.planStatus,
          quotaPeso: branch.quotaPeso,
          minLevelDays: branch.minLevelDays,
          minLevelPeso: branch.minLevelPeso,
          dropsPerMonth: branch.dropsPerMonth,
          historyQty: branch.historyQty,
          historyPeso: branch.historyPeso,
          milQty: branch.milQty,
          milPeso: branch.milPeso,
          displayUnits: branch.displayUnits,
          onHandQty: branch.onHandQty,
          forecastQty: branch.forecastQty,
          forecastPeso: branch.forecastPeso,
          allocQty: branch.allocQty,
          allocPeso: branch.allocPeso,
          drop1Qty: branch.drop1Qty,
          drop1Peso: branch.drop1Peso,
          cycleQty: branch.cycleQty,
          planogramSkuCount: branch.planogramSkuCount,
          coverageDays: branch.coverageDays,
        },
      });
      if (branch.lines.length === 0) return;
      await tx.demandPlanningLine.createMany({
        data: branch.lines.map((line) => ({
          tenantId,
          runId,
          runBranchId,
          modelId: line.modelId,
          skuCode: line.skuCode,
          seriesCode: line.seriesCode,
          srp: line.srp,
          planogramFlag: line.planogramFlag,
          historyQty: line.historyQty,
          historyPeso: line.historyPeso,
          hmix: line.hmix,
          adjHmix: line.adjHmix,
          milQty: line.milQty,
          milPeso: line.milPeso,
          computedDisplayUnits: line.computedDisplayUnits,
          displayUnits: line.displayUnits,
          onHandQty: line.onHandQty,
          computedForecastQty: line.computedForecastQty,
          forecastQty: line.forecastQty,
          forecastPeso: line.forecastPeso,
          allocQty: line.allocQty,
          allocPeso: line.allocPeso,
          cycleQty: line.cycleQty,
          computedDrop1Qty: line.computedDrop1Qty,
          drop1Peso: line.drop1Peso,
          totalInventoryQty: line.totalInventoryQty,
          totalInventoryPeso: line.totalInventoryPeso,
        })),
      });
    });
  },

  updateRunStatus(
    tenantId: string,
    runId: string,
    data: {
      status: DemandPlanningRunStatus;
      releasedAt?: Date | null;
    },
  ) {
    return prisma.demandPlanningRun.update({
      where: { id: runId },
      data,
    });
  },

  findLatestPlanRunForPeriod(tenantId: string, periodId: string) {
    return prisma.demandPlanningRun.findFirst({
      where: {
        tenantId,
        periodId,
        status: { in: ["generated", "released"] },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        documentNumber: true,
        status: true,
        releasedAt: true,
        branches: {
          select: { branchId: true, planStatus: true },
        },
      },
    });
  },

  findLatestReleasedRunForPeriod(tenantId: string, periodId: string) {
    return prisma.demandPlanningRun.findFirst({
      where: { tenantId, periodId, status: "released" },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
      include: {
        period: { select: { id: true, label: true, startDate: true, endDate: true } },
        branches: {
          include: {
            branch: { select: { id: true, sapCode: true, name: true } },
          },
        },
      },
    });
  },

  listLineIdsForRunBranch(tenantId: string, runId: string, branchId: string) {
    return prisma.demandPlanningLine.findMany({
      where: { tenantId, runId, runBranch: { branchId } },
      select: { id: true, modelId: true, runBranchId: true },
    });
  },

  createOverridesMany(
    rows: Array<{
      tenantId: string;
      runId: string;
      runBranchId?: string | null;
      lineId?: string | null;
      userId: string;
      field: string;
      beforeValue: string;
      afterValue: string;
    }>,
  ) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    const now = new Date();
    return prisma.demandPlanningOverride.createMany({
      data: rows.map((row) => ({
        ...row,
        createdAt: now,
        updatedAt: now,
      })),
    });
  },

  async originalDocumentNumbers(
    tenantId: string,
    runs: Array<{ id: string; documentNumber: string; supersedesRunId: string | null }>,
  ): Promise<Map<string, string | null>> {
    const byId = new Map(runs.map((run) => [run.id, run]));
    let pending = [
      ...new Set(
        runs
          .map((run) => run.supersedesRunId)
          .filter((id): id is string => id != null)
          .filter((id) => !byId.has(id)),
      ),
    ];

    while (pending.length > 0) {
      const found = await prisma.demandPlanningRun.findMany({
        where: { tenantId, id: { in: pending } },
        select: { id: true, documentNumber: true, supersedesRunId: true },
      });
      for (const row of found) byId.set(row.id, row);
      pending = [
        ...new Set(
          found
            .map((row) => row.supersedesRunId)
            .filter((id): id is string => id != null)
            .filter((id) => !byId.has(id)),
        ),
      ];
    }

    const originals = new Map<string, string | null>();
    for (const run of runs) {
      if (!run.supersedesRunId) {
        originals.set(run.id, null);
        continue;
      }
      let current: { id: string; documentNumber: string; supersedesRunId: string | null } | undefined =
        run;
      const seen = new Set<string>();
      while (current?.supersedesRunId && !seen.has(current.id)) {
        seen.add(current.id);
        const parent = byId.get(current.supersedesRunId);
        if (!parent) break;
        current = parent;
      }
      const original =
        current && current.documentNumber !== run.documentNumber ? current.documentNumber : null;
      originals.set(run.id, original);
    }
    return originals;
  },
};

export type { DemandPlanningRunStatus };
