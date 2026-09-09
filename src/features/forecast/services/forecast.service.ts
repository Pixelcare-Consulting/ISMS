import { auditService } from "@/features/audit/services/audit.service";
import { allocationService } from "@/features/forecast/services/allocation.service";
import { forecastRepository } from "@/features/forecast/repositories/forecast.repository";
import {
  planningTargetBulkDeleteSchema,
  planningTargetCreateSchema,
  planningTargetDeleteSchema,
  planningTargetUpdateSchema,
} from "@/features/forecast/schemas/planning-target.schema";
import { decimalToNumber } from "@/lib/database/decimal";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export type ClientPlanningTarget = {
  id: string;
  branchId: string;
  revenueTarget: number;
  revenueLabel: string;
  branch: { name: string; sapCode: string };
};

type PlanningTargetWithBranch = {
  id: string;
  branchId: string;
  revenueTarget: { toString(): string } | number;
  branch: { name: string; sapCode: string };
};

function formatRevenueTarget(value: { toString(): string } | number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(decimalToNumber(value));
}

export function toClientPlanningTarget(row: PlanningTargetWithBranch): ClientPlanningTarget {
  return {
    id: row.id,
    branchId: row.branchId,
    revenueTarget: decimalToNumber(row.revenueTarget),
    revenueLabel: formatRevenueTarget(row.revenueTarget),
    branch: { name: row.branch.name, sapCode: row.branch.sapCode },
  };
}

export const forecastService = {
  async getPlanningDashboard(tenantId: string, periodId?: string) {
    const requestedId = periodId?.trim() || undefined;
    const [requested, draftOrders, tenantBranchCount] = await Promise.all([
      requestedId
        ? forecastRepository.getPlanningSummary(tenantId, requestedId)
        : Promise.resolve(null),
      forecastRepository.countDraftAutoReplenishOrders(tenantId),
      forecastRepository.countTenantBranches(tenantId),
    ]);

    let period = requested;
    if (!period) {
      period = await forecastRepository.getPlanningSummary(tenantId);
    }
    if (!period) {
      const newest = (await forecastRepository.listPeriods(tenantId))[0];
      period = newest
        ? await forecastRepository.getPlanningSummary(tenantId, newest.id)
        : null;
    }

    const gapCount = period
      ? await forecastRepository.countGapsForPeriod(tenantId, period.id)
      : 0;

    return {
      period,
      gapCount,
      draftOrders,
      targetBranchCount: period?._count.branchTargets ?? 0,
      tenantBranchCount,
      allocationRowCount: period?._count.allocations ?? 0,
    };
  },

  listPlanningPeriods(tenantId: string) {
    return forecastRepository.listPeriods(tenantId);
  },

  async activatePlanningPeriod(tenantId: string, periodId: string) {
    const period = await forecastRepository.activatePeriod(tenantId, periodId);
    if (!period) throw new Error("Planning period not found");
    return period;
  },

  runAllocation(tenantId: string, periodId: string) {
    return allocationService.runAllocation(tenantId, periodId);
  },

  formatRevenueTarget(value: { toString: () => string } | number) {
    return formatRevenueTarget(value);
  },

  async listPlanningTargets(tenantId: string, periodId: string) {
    const rows = await forecastRepository.listTargetsForPeriod(tenantId, periodId);
    return rows.map(toClientPlanningTarget);
  },

  async createPlanningTarget(input: {
    tenantId: string;
    actorUserId: string;
    periodId: string;
    branchId: string;
    revenueTarget: number;
  }) {
    const parsed = planningTargetCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const [period, branch] = await Promise.all([
      forecastRepository.findPeriodById(input.tenantId, parsed.data.periodId),
      forecastRepository.findBranchForPlanning(input.tenantId, parsed.data.branchId),
    ]);
    if (!period) throw new Error("Planning period not found");
    if (!branch) throw new Error("Branch not found");

    const existing = await forecastRepository.findTargetByPeriodBranch(
      input.tenantId,
      parsed.data.periodId,
      parsed.data.branchId,
    );
    if (existing) {
      throw new Error("This branch already has a target for this period");
    }

    try {
      const row = await forecastRepository.createTarget(input.tenantId, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "forecast.target_created",
        entityType: "BranchForecastTarget",
        entityId: row.id,
        metadata: {
          periodId: period.id,
          periodLabel: period.label,
          branchId: branch.id,
          sapCode: branch.sapCode,
          revenueTarget: parsed.data.revenueTarget,
          source: "planning-ui",
        },
      });
      return toClientPlanningTarget(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("This branch already has a target for this period");
      }
      throw error;
    }
  },

  async updatePlanningTarget(input: {
    tenantId: string;
    actorUserId: string;
    id: string;
    revenueTarget: number;
  }) {
    const parsed = planningTargetUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await forecastRepository.findTargetById(input.tenantId, parsed.data.id);
    if (!existing) throw new Error("Revenue target not found");

    const period = await forecastRepository.findPeriodById(input.tenantId, existing.periodId);
    if (!period) throw new Error("Planning period not found");

    const row = await forecastRepository.updateTargetRevenue(
      input.tenantId,
      parsed.data.id,
      parsed.data.revenueTarget,
    );
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "forecast.target_updated",
      entityType: "BranchForecastTarget",
      entityId: row.id,
      metadata: {
        periodId: period.id,
        periodLabel: period.label,
        branchId: existing.branchId,
        sapCode: existing.branch.sapCode,
        revenueTarget: parsed.data.revenueTarget,
        previousRevenueTarget: decimalToNumber(existing.revenueTarget),
        source: "planning-ui",
      },
    });
    return toClientPlanningTarget(row);
  },

  async deletePlanningTarget(input: { tenantId: string; actorUserId: string; id: string }) {
    const parsed = planningTargetDeleteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await forecastRepository.findTargetById(input.tenantId, parsed.data.id);
    if (!existing) throw new Error("Revenue target not found");

    const period = await forecastRepository.findPeriodById(input.tenantId, existing.periodId);
    await forecastRepository.deleteTarget(input.tenantId, existing.id);
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "forecast.target_deleted",
      entityType: "BranchForecastTarget",
      entityId: existing.id,
      metadata: {
        periodId: existing.periodId,
        periodLabel: period?.label,
        branchId: existing.branchId,
        sapCode: existing.branch.sapCode,
        revenueTarget: decimalToNumber(existing.revenueTarget),
        source: "planning-ui",
      },
    });
  },

  async deletePlanningTargets(input: {
    tenantId: string;
    actorUserId: string;
    ids: string[];
  }) {
    const parsed = planningTargetBulkDeleteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const uniqueIds = [...new Set(parsed.data.ids)];
    const rows = await Promise.all(
      uniqueIds.map((id) => forecastRepository.findTargetById(input.tenantId, id)),
    );
    const existing = rows.filter((row): row is NonNullable<(typeof rows)[number]> => row != null);
    if (existing.length === 0) throw new Error("Revenue target not found");

    await forecastRepository.deleteTargets(
      input.tenantId,
      existing.map((row) => row.id),
    );
    await auditService.logMany(
      existing.map((row) => ({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "forecast.target_deleted",
        entityType: "BranchForecastTarget",
        entityId: row.id,
        metadata: {
          periodId: row.periodId,
          branchId: row.branchId,
          sapCode: row.branch.sapCode,
          revenueTarget: decimalToNumber(row.revenueTarget),
          source: "planning-ui",
        },
      })),
    );
    return { deleted: existing.length };
  },
};
