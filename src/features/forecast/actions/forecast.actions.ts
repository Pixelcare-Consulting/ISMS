"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { branchService } from "@/features/branches/services/branch.service";
import { forecastService } from "@/features/forecast/services/forecast.service";
import {
  planningTargetBulkDeleteSchema,
  planningTargetCreateSchema,
  planningTargetDeleteSchema,
  planningTargetUpdateSchema,
} from "@/features/forecast/schemas/planning-target.schema";
import {
  suggestedOrderService,
  type DraftOrderListSort,
  type DraftOrderListSortDir,
} from "@/features/forecast/services/suggested-order.service";
import {
  forecastRepository,
  type AllocationGapListSort,
  type AllocationGapListSortDir,
} from "@/features/forecast/repositories/forecast.repository";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";

const ALLOCATION_GAP_SORT_FIELDS = new Set<AllocationGapListSort>([
  "branch",
  "sku",
  "currentStock",
  "planogramMax",
  "gapQty",
]);
const DRAFT_ORDER_SORT_FIELDS = new Set<DraftOrderListSort>([
  "orderNumber",
  "branch",
  "status",
]);

function parseAllocationGapSort(value?: string): AllocationGapListSort | undefined {
  if (value && ALLOCATION_GAP_SORT_FIELDS.has(value as AllocationGapListSort)) {
    return value as AllocationGapListSort;
  }
  return undefined;
}

function parseDraftOrderSort(value?: string): DraftOrderListSort | undefined {
  if (value && DRAFT_ORDER_SORT_FIELDS.has(value as DraftOrderListSort)) {
    return value as DraftOrderListSort;
  }
  return undefined;
}

function parseSortDir(
  value?: string,
): DraftOrderListSortDir | AllocationGapListSortDir | undefined {
  if (value === "asc" || value === "desc") return value;
  return undefined;
}

function revalidatePlanning() {
  revalidatePath("/settings/planning");
  revalidatePath("/planning/suggested-orders");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/settings/planogram");
}

async function requireForecastManage() {
  return requireAnyPermission(["forecast.manage", "planogram.manage"]);
}

export async function getPlanningDashboardAction(periodId?: string) {
  const session = await requireForecastManage();
  return forecastService.getPlanningDashboard(session.user.tenantId, periodId);
}

export async function listPlanningPeriodsAction() {
  const session = await requireForecastManage();
  return forecastService.listPlanningPeriods(session.user.tenantId);
}

export async function activatePlanningPeriodAction(periodId: string) {
  const session = await requireForecastManage();
  const parsed = z.string().min(1, "Planning period is required").safeParse(periodId);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid period" };
  }
  try {
    const period = await forecastService.activatePlanningPeriod(
      session.user.tenantId,
      parsed.data,
    );
    revalidatePlanning();
    return { success: true as const, period };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to switch period" };
  }
}

export async function listPlanningTargetsAction(periodId: string) {
  const session = await requireForecastManage();
  return forecastRepository.listTargetsForPeriod(session.user.tenantId, periodId);
}

export async function createPlanningTargetAction(input: unknown) {
  const session = await requireForecastManage();
  const parsed = planningTargetCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const row = await forecastService.createPlanningTarget({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePlanning();
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add target" };
  }
}

export async function updatePlanningTargetAction(input: unknown) {
  const session = await requireForecastManage();
  const parsed = planningTargetUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const row = await forecastService.updatePlanningTarget({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePlanning();
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update target" };
  }
}

export async function deletePlanningTargetAction(input: unknown) {
  const session = await requireForecastManage();
  const parsed = planningTargetDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await forecastService.deletePlanningTarget({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      id: parsed.data.id,
    });
    revalidatePlanning();
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove target" };
  }
}

export async function deletePlanningTargetsAction(input: unknown) {
  const session = await requireForecastManage();
  const parsed = planningTargetBulkDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const result = await forecastService.deletePlanningTargets({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ids: parsed.data.ids,
    });
    revalidatePlanning();
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove targets" };
  }
}

export async function listAllocationGapsAction(
  periodId: string,
  input?: {
    page?: number;
    limit?: number;
    branchId?: string;
    q?: string;
    sort?: string;
    sortDir?: string;
  },
) {
  const session = await requireForecastManage();
  return forecastRepository.listAllocationsForPeriodPaginated(
    session.user.tenantId,
    periodId,
    { page: input?.page, limit: input?.limit },
    { branchId: input?.branchId, q: input?.q },
    { field: parseAllocationGapSort(input?.sort), dir: parseSortDir(input?.sortDir) },
  );
}

export async function listBranchesForPlanningAction() {
  const session = await requireForecastManage();
  const branches = await branchService.listBranches(session.user.tenantId);
  return branches.map((b) => ({ id: b.id, name: b.name, sapCode: b.sapCode }));
}

export async function runAllocationAction(periodId: string) {
  const session = await requireForecastManage();

  try {
    const result = await forecastService.runAllocation(
      session.user.tenantId,
      periodId,
    );
    revalidatePlanning();
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Allocation failed" };
  }
}

export async function generateSuggestedOrdersAction(periodId: string) {
  const session = await requireForecastManage();

  try {
    const orders = await suggestedOrderService.generateSuggestedOrders(
      session.user.tenantId,
      periodId,
      session.user.id,
    );
    revalidatePlanning();
    return { success: true as const, orders };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate suggestions" };
  }
}

export async function submitSuggestedOrdersAction() {
  const session = await requireForecastManage();

  try {
    const orders = await suggestedOrderService.submitDraftOrdersForReview(
      session.user.tenantId,
      session.user.id,
    );
    revalidatePlanning();
    return { success: true as const, orders };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Submit failed" };
  }
}

export async function listDraftSuggestedOrdersAction(input?: {
  page?: number;
  branchId?: string;
  q?: string;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requireForecastManage();
  return suggestedOrderService.listDraftSuggestedOrdersPaginated(
    session.user.tenantId,
    { page: input?.page },
    { branchId: input?.branchId, q: input?.q },
    { field: parseDraftOrderSort(input?.sort), dir: parseSortDir(input?.sortDir) },
  );
}

export async function canManageForecastAction() {
  const session = await requireAnyPermission(["planogram.view", "forecast.manage", "planogram.manage"]);
  return (
    hasPermission(session.user.permissions, "forecast.manage") ||
    hasPermission(session.user.permissions, "planogram.manage")
  );
}
