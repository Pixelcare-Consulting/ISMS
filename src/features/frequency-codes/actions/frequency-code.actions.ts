"use server";

import { revalidatePath } from "next/cache";

import { frequencyCodeService } from "@/features/frequency-codes/services/frequency-code.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listFrequencyCodesAction() {
  const session = await requirePermission("ordering_settings.manage");
  return frequencyCodeService.list(session.user.tenantId);
}

export async function createFrequencyCodeAction(input: {
  code: string;
  frequency: string;
  description: string;
}) {
  const session = await requirePermission("ordering_settings.manage");
  try {
    await frequencyCodeService.create({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...input,
    });
    revalidatePath("/settings/ordering");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create frequency code" };
  }
}

export async function updateFrequencyCodeAction(input: {
  id: string;
  code: string;
  frequency: string;
  description: string;
}) {
  const session = await requirePermission("ordering_settings.manage");
  try {
    await frequencyCodeService.update({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      ...input,
    });
    revalidatePath("/settings/ordering");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update frequency code" };
  }
}

export async function deleteFrequencyCodeAction(id: string) {
  const session = await requirePermission("ordering_settings.manage");
  try {
    await frequencyCodeService.delete({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      id,
    });
    revalidatePath("/settings/ordering");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete frequency code" };
  }
}
