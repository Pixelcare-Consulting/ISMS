"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { requirePermission } from "@/lib/auth/permissions";

const updateSchema = z.object({
  globalLockedWeekdays: z.array(z.number().int().min(0).max(6)),
});

export async function updateOrderingPolicyAction(input: unknown) {
  const session = await requirePermission("ordering_settings.manage");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await orderingPolicyService.updatePolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      globalLockedWeekdays: parsed.data.globalLockedWeekdays,
    });
    revalidatePath("/settings/ordering");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update ordering policy" };
  }
}
