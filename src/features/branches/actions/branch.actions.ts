"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { branchService } from "@/features/branches/services/branch.service";
import { branchScheduleSchema } from "@/features/branches/schemas/branch.schema";
import { requirePermission } from "@/lib/auth/permissions";

const branchInputSchema = z.object({
  sapCode: z.string().min(1),
  name: z.string().min(1),
  areaId: z.string().optional().nullable(),
  branchAreaId: z.string().optional().nullable(),
  dealerId: z.string().optional().nullable(),
  primaryWarehouseId: z.string().optional().nullable(),
  regionId: z.string().optional().nullable(),
  provinceId: z.string().optional().nullable(),
  alternateBranchIds: z.array(z.string()).optional(),
  schedule: branchScheduleSchema.optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function listBranchesAction() {
  const session = await requirePermission("branches.manage");
  return branchService.listBranches(session.user.tenantId);
}

export async function listBranchFormOptionsAction() {
  const session = await requirePermission("branches.manage");
  return branchService.listFormOptions(session.user.tenantId);
}

export async function createBranchAction(input: unknown) {
  const session = await requirePermission("branches.manage");
  const parsed = branchInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const branch = await branchService.createBranch({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branches");
    return { success: true as const, branch };
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
    const branch = await branchService.updateBranch({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath("/settings/branches");
    return { success: true as const, branch };
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
    return { success: true as const, branchId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete branch" };
  }
}
