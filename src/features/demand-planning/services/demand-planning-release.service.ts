import { auditService } from "@/features/audit/services/audit.service";
import { getOrderApprovalChain } from "@/features/orders/constants/order-workflow";
import { nextSalesOrderNumber } from "@/features/orders/utils/next-sales-order-number";
import {
  freezeReleasedDrop1Qty,
  orderDetailsFromDrop1Lines,
  shouldSkipBranchForRelease,
} from "@/features/demand-planning/lib/release-lines";
import { demandPlanningRepository } from "@/features/demand-planning/repositories/demand-planning.repository";
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

export const demandPlanningReleaseService = {
  async releaseRun(tenantId: string, actorUserId: string, runId: string) {
    const run = await demandPlanningRepository.findRunById(tenantId, runId);
    if (!run) throw new Error("Demand planning run not found");
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
    const approvalChain = getOrderApprovalChain("auto_replenish");

    for (const branch of run.branches) {
      const branchName = `${branch.branch.sapCode} ${branch.branch.name}`;
      if (shouldSkipBranchForRelease(branch.planStatus)) {
        skipped.push({ branchName, reason: "no history" });
        continue;
      }

      const details = orderDetailsFromDrop1Lines(linesByBranch.get(branch.id) ?? []);
      if (details.length === 0) {
        skipped.push({ branchName, reason: "no Drop 1 quantity" });
        continue;
      }

      const existingDraft = await demandPlanningRepository.findExistingAutoReplenishDraft(
        tenantId,
        branch.branchId,
      );
      if (existingDraft) {
        skipped.push({
          branchName,
          reason: `draft ${existingDraft.orderNumber} already exists`,
        });
        continue;
      }

      const orderNumber = await nextSalesOrderNumber(tenantId);
      const order = await prisma.branchOrder.create({
        data: {
          tenantId,
          branchId: branch.branchId,
          orderType: "auto_replenish",
          orderNumber,
          status: "draft",
          createdById: actorUserId,
          notes: `Demand Planning ${run.documentNumber} Drop 1 (${run.period.label})`,
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
      created.push({
        id: order.id,
        orderNumber: order.orderNumber,
        branchName,
      });
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
