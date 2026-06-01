"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { branchService } from "@/features/branches/services/branch.service";
import { requirePermission } from "@/lib/auth/permissions";

const branchInputSchema = z.object({
  sapCode: z.string().min(1),
  name: z.string().min(1),
  branchAreaId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function listBranchesAction() {
  const session = await requirePermission("branches.manage");
  const branches = await branchService.listBranches(session.user.tenantId);
  return branches.map((b) => ({
    ...b,
    area: b.branchArea,
  }));
}

export async function listBranchAreasAction() {
  const session = await requirePermission("branches.manage");
  return branchService.listAreas(session.user.tenantId);
}

export async function createBranchAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = branchInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await branchService.createBranch({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branches");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create branch" };
  }
}

export async function updateBranchAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = branchInputSchema
    .extend({ branchId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await branchService.updateBranch({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branches");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update branch" };
  }
}

export async function deleteBranchAction(branchId: string) {
  const session = await requirePermission("branches.manage");
  try {
    await branchService.deleteBranch({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      branchId,
    });
    revalidatePath("/settings/branches");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete branch" };
  }
}
