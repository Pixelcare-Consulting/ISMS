"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { branchQuotaFormSchema } from "@/features/branch-quotas/schemas/branch-quota.schema";
import { branchQuotaService } from "@/features/branch-quotas/services/branch-quota.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listBranchQuotasAction() {
  const session = await requirePermission("branches.manage");
  return branchQuotaService.list(session.user.tenantId);
}

export async function listBranchQuotaFormOptionsAction() {
  const session = await requirePermission("branches.manage");
  return branchQuotaService.listFormOptions(session.user.tenantId);
}

export async function createBranchQuotaAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = branchQuotaFormSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const row = await branchQuotaService.create({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branch-quotas");
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create quota" };
  }
}

export async function updateBranchQuotaAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = branchQuotaFormSchema
    .extend({ id: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    const row = await branchQuotaService.update({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branch-quotas");
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update quota" };
  }
}

export async function deleteBranchQuotaAction(id: string) {
  const session = await requirePermission("branches.manage");
  try {
    await branchQuotaService.delete({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      id,
    });
    revalidatePath("/settings/branch-quotas");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete quota" };
  }
}
