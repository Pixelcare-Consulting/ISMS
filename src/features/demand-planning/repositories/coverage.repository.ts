import type { DemandPlanningRunStatus } from "@prisma/client";

import { prisma } from "@/lib/database/client";

const COVERAGE_RUN_STATUSES: DemandPlanningRunStatus[] = ["generated", "released"];

const coverageLineSelect = {
  skuCode: true,
  seriesCode: true,
  srp: true,
  planogramFlag: true,
  historyQty: true,
  historyPeso: true,
  displayUnits: true,
  onHandQty: true,
  forecastQty: true,
} as const;

/**
 * Read-only queries for the coverage monitor. Prefer the latest generated or
 * released run for a period — drafts and superseded documents are ignored.
 */
export const coverageRepository = {
  listPeriods(tenantId: string) {
    return prisma.planningPeriod.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, isActive: true },
    });
  },

  /**
   * Latest generated/released DemandPlanningRun for the period.
   * Works once the wizard has written runs; returns null while none exist.
   */
  findLatestCoverageRun(tenantId: string, periodId: string) {
    return prisma.demandPlanningRun.findFirst({
      where: {
        tenantId,
        periodId,
        status: { in: COVERAGE_RUN_STATUSES },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        period: { select: { id: true, label: true, isActive: true } },
        branches: {
          include: {
            branch: { select: { id: true, sapCode: true, name: true } },
            lines: { select: coverageLineSelect },
          },
          orderBy: { branch: { sapCode: "asc" } },
        },
      },
    });
  },
};
