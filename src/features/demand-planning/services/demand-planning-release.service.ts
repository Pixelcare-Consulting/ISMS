import type { DemandPlanningPlanStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  freezeReleasedDrop1Qty,
  orderDetailsFromDrop1Lines,
  shouldSkipBranchForRelease,
} from "@/features/demand-planning/lib/release-lines";
import { demandPlanningRepository } from "@/features/demand-planning/repositories/demand-planning.repository";
import type {
  DemandPlanReleasePreview,
  ReleasePreviewBranch,
} from "@/features/demand-planning/types/run.types";
import { prisma } from "@/lib/database/client";

export type ReleasedOrderResult = {
  id: string;
  orderNumber: string;
  branchName: string;
};

export type SkippedReleaseBranch = {
  branchName: string;
  reason: string;
};

export type { DemandPlanReleasePreview, ReleasePreviewBranch } from "@/features/demand-planning/types/run.types";

type ReleaseBranchClassification = {
  branchName: string;
  planStatus: DemandPlanningPlanStatus;
  details: Array<{ modelId: string; quantity: number }>;
};

type ClassifiedReleaseRun = {
  run: NonNullable<Awaited<ReturnType<typeof demandPlanningRepository.findRunById>>>;
  lines: Awaited<ReturnType<typeof demandPlanningRepository.listLinesForRun>>;
  classifications: ReleaseBranchClassification[];
};

async function classifyBranchesForRelease(
  tenantId: string,
  runId: string,
): Promise<ClassifiedReleaseRun> {
  const run = await demandPlanningRepository.findRunById(tenantId, runId);
  if (!run) throw new Error("Supply planning run not found");
  if (run.status === "released") {
    throw new Error("This plan is already released");
  }
  if (run.status === "superseded") {
    throw new Error("This plan was replaced by a newer version");
  }
  if (run.status !== "generated") {
    throw new Error("Generate the plan before releasing to Ordering");
  }

  const lines = await demandPlanningRepository.listLinesForRun(tenantId, runId);
  const linesByBranch = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = linesByBranch.get(line.runBranchId) ?? [];
    list.push(line);
    linesByBranch.set(line.runBranchId, list);
  }

  const classifications: ReleaseBranchClassification[] = [];
  for (const branch of run.branches) {
    const branchName = `${branch.branch.sapCode} ${branch.branch.name}`;
    const details = shouldSkipBranchForRelease(branch.planStatus)
      ? []
      : orderDetailsFromDrop1Lines(linesByBranch.get(branch.id) ?? []);
    classifications.push({
      branchName,
      planStatus: branch.planStatus,
      details,
    });
  }

  return { run, lines, classifications };
}

function previewFromClassifications(
  classifications: ReleaseBranchClassification[],
): DemandPlanReleasePreview {
  const willRelease: ReleasePreviewBranch[] = [];
  const noHistory: ReleasePreviewBranch[] = [];
  const noDrop1: ReleasePreviewBranch[] = [];

  for (const row of classifications) {
    if (shouldSkipBranchForRelease(row.planStatus) || row.details.length === 0) {
      noDrop1.push({ branchName: row.branchName });
      continue;
    }
    willRelease.push({ branchName: row.branchName });
    if (row.planStatus === "no_history") {
      noHistory.push({ branchName: row.branchName });
    }
  }

  return { willRelease, noHistory, noDrop1, openOrder: [] };
}

export const demandPlanningReleaseService = {
  /** Read-only classification of what Release would do (no mutate). */
  async previewRelease(tenantId: string, runId: string): Promise<DemandPlanReleasePreview> {
    const { classifications } = await classifyBranchesForRelease(tenantId, runId);
    return previewFromClassifications(classifications);
  },

  async releaseRun(tenantId: string, actorUserId: string, runId: string) {
    const { run, lines, classifications } = await classifyBranchesForRelease(tenantId, runId);

    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        await tx.demandPlanningLine.update({
          where: { id: line.id },
          data: { releasedDrop1Qty: freezeReleasedDrop1Qty(line.computedDrop1Qty) },
        });
      }

      await tx.demandPlanningRun.update({
        where: { id: run.id },
        data: { status: "released", releasedAt: new Date() },
      });

      if (run.supersedesRunId) {
        await tx.demandPlanningRun.updateMany({
          where: {
            tenantId,
            id: run.supersedesRunId,
            status: "released",
          },
          data: { status: "superseded" },
        });
      }
    });

    const created: ReleasedOrderResult[] = [];
    const skipped: SkippedReleaseBranch[] = [];

    for (const row of classifications) {
      if (shouldSkipBranchForRelease(row.planStatus)) {
        skipped.push({ branchName: row.branchName, reason: "skipped by plan status" });
        continue;
      }
      if (row.details.length === 0) {
        skipped.push({ branchName: row.branchName, reason: "no Drop 1 quantity" });
      }
    }

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "demand_planning.run_released",
      entityType: "DemandPlanningRun",
      entityId: run.id,
      metadata: {
        documentNumber: run.documentNumber,
        orderCount: created.length,
        skippedCount: skipped.length,
      },
    });

    return { orders: created, skipped };
  },
};
