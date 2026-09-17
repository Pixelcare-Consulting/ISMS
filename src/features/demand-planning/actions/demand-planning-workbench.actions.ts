"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canManageDemandPlanning,
  canSendDemandPlanning,
  canViewDemandPlanning,
} from "@/features/demand-planning/lib/permissions";
import {
  replenishmentMatrixQuerySchema,
  sendWorkbenchSchema,
} from "@/features/demand-planning/schemas/demand-planning-workbench.schema";
import { demandPlanningWorkbenchService } from "@/features/demand-planning/services/demand-planning-workbench.service";
import { demandPlanningRunService } from "@/features/demand-planning/services/demand-planning-run.service";
import { requireAuth } from "@/lib/auth/permissions";

async function requireView() {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export async function getReplenishmentAccessAction() {
  const session = await requireView();
  return {
    canView: true,
    canManage: canManageDemandPlanning(session.user.permissions),
    canSend: canSendDemandPlanning(session.user.permissions),
  };
}

export async function listReplenishmentPeriodsAction() {
  const session = await requireView();
  return demandPlanningRunService.listPeriods(session.user.tenantId);
}

export async function listReplenishmentMatrixAction(input?: {
  periodId?: string;
  q?: string;
  page?: number;
  limit?: number;
}) {
  const session = await requireView();
  const parsed = replenishmentMatrixQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid filters" };
  }
  const view = await demandPlanningWorkbenchService.listMatrix(session.user.tenantId, parsed.data);
  return { view };
}

export async function getReplenishmentWorkbenchAction(branchId: string, periodId?: string) {
  const session = await requireView();
  if (!branchId) return { error: "Branch is required" };
  try {
    const snapshot = await demandPlanningWorkbenchService.getWorkbench(
      session.user.tenantId,
      branchId,
      periodId,
    );
    return { snapshot };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load workbench" };
  }
}

export async function sendReplenishmentWorkbenchAction(input: unknown) {
  const session = await requireAuth();
  if (!canSendDemandPlanning(session.user.permissions)) {
    return {
      error: "You need forecast manage and auto-replenish create access to send a supplementary order",
    };
  }
  const parsed = sendWorkbenchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid send payload" };
  }
  try {
    const result = await demandPlanningWorkbenchService.sendSupplementary(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidatePath("/planning/replenishment");
    revalidatePath(`/planning/replenishment/${parsed.data.branchId}`);
    revalidatePath("/orders/auto-replenish");
    return { success: true as const, ...result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Send failed" };
  }
}
