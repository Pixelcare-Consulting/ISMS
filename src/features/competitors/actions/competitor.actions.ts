"use server";

import { revalidatePath } from "next/cache";

import { competitorService } from "@/features/competitors/services/competitor.service";
import {
  competitorReportQuerySchema,
  createCompetitorObservationSchema,
  updateCompetitorObservationSchema,
} from "@/features/competitors/schemas/competitor.schema";
import { hasCompetitorFullAccess } from "@/features/competitors/constants/competitor-access";
import { requirePermission } from "@/lib/auth/permissions";

function revalidateCompetitors() {
  revalidatePath("/competitors");
}

export async function listCompetitorObservationsAction(filter?: {
  branchId?: string | null;
  competitorBrandId?: string | null;
  competitorName?: string | null;
}) {
  const session = await requirePermission("competitors.view");
  return competitorService.list(
    session.user.tenantId,
    session.user.id,
    hasCompetitorFullAccess(session.user.permissions),
    {
      branchId: filter?.branchId ?? null,
      competitorBrandId: filter?.competitorBrandId ?? null,
      competitorName: filter?.competitorName ?? null,
    },
  );
}

/** CSV of observations: everything, or only the From/To days and filters given. */
export async function exportCompetitorReportCsvAction(input: unknown) {
  const session = await requirePermission("competitors.view");
  const parsed = competitorReportQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid report filters" };
  }

  try {
    const csv = await competitorService.generateReportCsv(
      session.user.tenantId,
      session.user.id,
      hasCompetitorFullAccess(session.user.permissions),
      parsed.data,
    );
    const { from, to } = parsed.data;
    const range = from || to ? `${from ?? "start"}-to-${to ?? "today"}` : "all";
    return {
      success: true as const,
      csv,
      filename: `competitors-report-${range}.csv`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not generate the report" };
  }
}

export async function getCompetitorKpisAction() {
  const session = await requirePermission("competitors.view");
  return competitorService.getKpis(
    session.user.tenantId,
    session.user.id,
    hasCompetitorFullAccess(session.user.permissions),
  );
}

export async function listCompetitorFormOptionsAction() {
  const session = await requirePermission("competitors.view");
  return competitorService.listFormOptions(
    session.user.tenantId,
    session.user.id,
    hasCompetitorFullAccess(session.user.permissions),
  );
}

export async function createCompetitorObservationAction(input: unknown) {
  const session = await requirePermission("competitors.manage");
  const parsed = createCompetitorObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const observation = await competitorService.create({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidateCompetitors();
    return { success: true as const, observation };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create observation" };
  }
}

export async function updateCompetitorObservationAction(input: unknown) {
  const session = await requirePermission("competitors.manage");
  const parsed = updateCompetitorObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const observation = await competitorService.update({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidateCompetitors();
    return { success: true as const, observation };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update observation" };
  }
}

export async function deleteCompetitorObservationAction(id: string) {
  const session = await requirePermission("competitors.manage");
  try {
    await competitorService.delete({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      id,
    });
    revalidateCompetitors();
    return { success: true as const, id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete observation" };
  }
}
