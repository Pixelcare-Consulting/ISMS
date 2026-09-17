"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { demandPlanningGridToCsv } from "@/features/demand-planning/lib/grid-csv";
import { DEMAND_PLANNING_RUNS_PATH } from "@/features/demand-planning/lib/paths";
import {
  canManageDemandPlanning,
  canReleaseDemandPlanning,
  canSendDemandPlanning,
  canViewDemandPlanning,
} from "@/features/demand-planning/lib/permissions";
import {
  demandPlanOverrideSchema,
  demandPlanRunIdSchema,
  generateDemandPlanSchema,
} from "@/features/demand-planning/schemas/demand-planning-run.schema";
import { demandPlanningReleaseService } from "@/features/demand-planning/services/demand-planning-release.service";
import { demandPlanningRunService } from "@/features/demand-planning/services/demand-planning-run.service";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";

function revalidateDemandPlanning(runId?: string) {
  revalidatePath(DEMAND_PLANNING_RUNS_PATH);
  revalidatePath("/settings/planning");
  revalidatePath("/planning/replenishment");
  if (runId) revalidatePath(`${DEMAND_PLANNING_RUNS_PATH}/${runId}`);
  revalidatePath("/orders/auto-replenish");
}

async function requireView() {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

async function requireManage() {
  const session = await requireAuth();
  if (!canManageDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export async function getDemandPlanningAccessAction() {
  const session = await requireView();
  return {
    canView: true,
    canManage: canManageDemandPlanning(session.user.permissions),
    canRelease: canReleaseDemandPlanning(session.user.permissions),
    canSend: canSendDemandPlanning(session.user.permissions),
    hasForecastManage: hasPermission(session.user.permissions, "forecast.manage"),
  };
}

export async function listDemandPlanningWizardOptionsAction() {
  const session = await requireManage();
  return demandPlanningRunService.listWizardOptions(session.user.tenantId);
}

export async function listDemandPlanningPeriodsAction() {
  const session = await requireView();
  return demandPlanningRunService.listPeriods(session.user.tenantId);
}

export async function listDemandPlanningRunsAction(input?: {
  page?: number;
  limit?: number;
  periodId?: string;
}) {
  const session = await requireView();
  return demandPlanningRunService.listRuns(
    session.user.tenantId,
    { page: input?.page, limit: input?.limit },
    { periodId: input?.periodId },
  );
}

export async function getDemandPlanningRunAction(runId: string) {
  const session = await requireView();
  const parsed = demandPlanRunIdSchema.safeParse({ runId });
  if (!parsed.success) return { error: "Invalid run" };
  const run = await demandPlanningRunService.getRun(session.user.tenantId, parsed.data.runId);
  if (!run) return { error: "Demand planning run not found" };
  return { run };
}

export async function getDemandPlanningRunGridAction(runId: string, runBranchId?: string) {
  const session = await requireView();
  const parsed = demandPlanRunIdSchema.safeParse({ runId });
  if (!parsed.success) return { error: "Invalid run" };
  const result = await demandPlanningRunService.getRunBranchGrid(
    session.user.tenantId,
    parsed.data.runId,
    runBranchId ?? "",
  );
  if (!result) return { error: "Demand planning run not found" };
  return result;
}

export async function previewDemandPlanSourcesAction(input: unknown) {
  const session = await requireManage();
  const parsed = generateDemandPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const preview = await demandPlanningRunService.previewSources(
      session.user.tenantId,
      parsed.data,
    );
    return { success: true as const, preview };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to preview sources" };
  }
}

export async function generateDemandPlanRunAction(input: unknown) {
  const session = await requireManage();
  const parsed = generateDemandPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const result = await demandPlanningRunService.generateRun(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidateDemandPlanning(result.runId);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate plan" };
  }
}

export async function recalculateDemandPlanRunAction(runId: string) {
  const session = await requireManage();
  const parsed = demandPlanRunIdSchema.safeParse({ runId });
  if (!parsed.success) return { error: "Invalid run" };
  try {
    const result = await demandPlanningRunService.recalculateRun(
      session.user.tenantId,
      session.user.id,
      parsed.data.runId,
    );
    revalidateDemandPlanning(result.runId);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Recalculate failed" };
  }
}

export async function saveDemandPlanOverrideAction(input: unknown) {
  const session = await requireManage();
  const parsed = demandPlanOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid override" };
  }
  try {
    const lines = await demandPlanningRunService.applyLineOverride(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidateDemandPlanning(parsed.data.runId);
    return { success: true as const, lines };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save override" };
  }
}

export async function releaseDemandPlanRunAction(runId: string) {
  const session = await requireAuth();
  if (!canReleaseDemandPlanning(session.user.permissions)) {
    return { error: "You need forecast manage and auto-replenish create access to release" };
  }
  const parsed = demandPlanRunIdSchema.safeParse({ runId });
  if (!parsed.success) return { error: "Invalid run" };
  try {
    const result = await demandPlanningReleaseService.releaseRun(
      session.user.tenantId,
      session.user.id,
      parsed.data.runId,
    );
    revalidateDemandPlanning(parsed.data.runId);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Release failed" };
  }
}

export async function exportDemandPlanRunAction(runId: string) {
  const session = await requireView();
  const parsed = demandPlanRunIdSchema.safeParse({ runId });
  if (!parsed.success) return { error: "Invalid run" };
  try {
    const result = await demandPlanningRunService.exportRunCsv(
      session.user.tenantId,
      parsed.data.runId,
    );
    return {
      success: true as const,
      filename: `${result.documentNumber}.csv`,
      csv: demandPlanningGridToCsv(result.rows),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Export failed" };
  }
}
